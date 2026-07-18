import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { pickDestination } from '../lib/destinations'
import { askPlanner, cardPrice } from '../lib/planner'
import { savePlace } from '../lib/savedPlaces'
import { supabase } from '../lib/supabase'
import { PlaceCardsSkeleton } from './Skeleton'
import { StaggerList, prefersReducedMotion as reduceMotion } from './motion'
import { asset } from '../lib/asset'

// A real 3D Earth (globe.gl / Three.js, lazy-loaded). It auto-rotates, whirls fast
// while "spinning", then flies + zooms into the chosen destination — a digital-twin
// feel. Falls back gracefully if WebGL/the module is unavailable.
const GLOBE_SIZE = 360
function Globe({ spinning, dest }) {
  const elRef = useRef(null)
  const gRef = useRef(null)

  useEffect(() => {
    let disposed = false
    ;(async () => {
      try {
        const GlobeGL = (await import('globe.gl')).default
        if (disposed || !elRef.current || gRef.current) return
        const g = GlobeGL()(elRef.current)
          .width(GLOBE_SIZE).height(GLOBE_SIZE)
          .backgroundColor('rgba(0,0,0,0)')
          .globeImageUrl(asset('textures/earth.jpg'))
          .showAtmosphere(true).atmosphereColor('#7cb3ff').atmosphereAltitude(0.2)
          .ringColor(() => '#E8462E').ringMaxRadius(7).ringPropagationSpeed(2.4).ringRepeatPeriod(650)
        const c = g.controls()
        c.enableZoom = false; c.autoRotate = true; c.autoRotateSpeed = 0.8
        g.pointOfView({ lat: 15, lng: 20, altitude: 2.5 })
        gRef.current = g
      } catch { /* WebGL unavailable — globe just won't render */ }
    })()
    return () => {
      disposed = true
      try { gRef.current && gRef.current._destructor && gRef.current._destructor() } catch { /* noop */ }
      gRef.current = null
    }
  }, [])

  useEffect(() => {
    const g = gRef.current
    if (!g) return
    const c = g.controls()
    if (spinning) {
      c.autoRotate = true; c.autoRotateSpeed = 16; g.ringsData([])
    } else if (dest && typeof dest.lat === 'number') {
      c.autoRotate = false
      g.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 1.35 }, reduceMotion() ? 0 : 2600)
      g.ringsData([{ lat: dest.lat, lng: dest.lng }])
    } else {
      c.autoRotate = true; c.autoRotateSpeed = 0.8
    }
  }, [spinning, dest])

  return <div ref={elRef} className="globe3d" role="img" aria-label="Interactive 3D globe" />
}

// className/style are forwarded so PlaceCard can be a StaggerList child (the
// primitive clones the reveal step onto its direct children).
function PlaceCard({ c, className = '', style }) {
  return (
    <article className={['place-card card', className].filter(Boolean).join(' ')} style={style}>
      {c.photo_url
        ? <div className="place-photo" style={{ backgroundImage: `url(${c.photo_url})` }} role="img" aria-label={c.name} />
        : <div className="place-photo placeholder" aria-hidden="true" />}
      <div className="place-body">
        <div className="place-head"><h4>{c.name}</h4><span className="chip">{c.category}</span></div>
        <div className="place-meta">
          {c.rating != null && <span className="num">{c.rating.toFixed(1)} ★{c.user_ratings_total != null ? ` · ${c.user_ratings_total.toLocaleString()}` : ''}</span>}
          {cardPrice(c) && <span className="num">{cardPrice(c)}</span>}
        </div>
        {c.why && <p className="place-why">{c.why}</p>}
      </div>
    </article>
  )
}

const isStay = cat => /accom|hotel|stay|lodg|resort|hostel/.test(cat)
const isEat = cat => /food|restaurant|eat|cafe|café|bar|dining|bistro/.test(cat)

// "Spin the globe → AI designs the holiday" starting experience.
export default function Discover() {
  const nav = useNavigate()
  const [dest, setDest] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [phase, setPhase] = useState('idle')        // idle | landed | planning | planned
  const [plan, setPlan] = useState({ reply: '', cards: [] })
  const [err, setErr] = useState('')
  const [creating, setCreating] = useState(false)
  const timer = useRef(null)

  // Split the AI's picks into the three buckets the trip is built from.
  const groups = useMemo(() => {
    const g = { stay: [], see: [], eat: [] }
    for (const c of plan.cards) {
      const cat = (c.category || '').toLowerCase()
      if (isStay(cat)) g.stay.push(c)
      else if (isEat(cat)) g.eat.push(c)
      else g.see.push(c)
    }
    return g
  }, [plan.cards])

  function spin() {
    if (spinning) return
    setErr(''); setPlan({ reply: '', cards: [] }); setPhase('idle'); setSpinning(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setDest(d => pickDestination(d?.name))
      setSpinning(false); setPhase('landed')
    }, reduceMotion() ? 200 : 2200)
  }

  async function designHoliday() {
    if (!dest) return
    setPhase('planning'); setErr('')
    const msg = `Plan a ${dest.days}-day holiday in ${dest.name}, ${dest.country}. `
      + 'Include a good spread across three areas: 2 great places to stay (accommodation — hotels or guesthouses), '
      + '4 top things to see and do (sights and activities), and 3 standout places to eat (food). '
      + 'Use real, well-rated places.'
    const { reply, cards, error } = await askPlanner(msg, [], { timeoutMs: 90000 })
    if (error) { setErr(error.message || 'The planner had trouble. Spin again or retry.'); setPhase('landed'); return }
    if (!cards.length) { setErr('No ideas came back — try spinning again.'); setPhase('landed'); return }
    setPlan({ reply, cards }); setPhase('planned')
  }

  async function createTrip() {
    if (!dest || !plan.cards.length || creating) return
    setCreating(true); setErr('')
    const { data: trip, error } = await supabase.from('trips')
      .insert({ name: `${dest.name}, ${dest.country}`, travelers: 2, base_currency: 'AUD' })
      .select('*').single()
    if (error) { setErr(error.message); setCreating(false); return }
    for (const c of plan.cards) { await savePlace(trip.id, c) }   // seed the trip with the AI's picks
    nav(`/app/trip/${trip.id}`)
  }

  const SECTIONS = [['stay', 'Where to stay'], ['see', 'Things to see & do'], ['eat', 'Where to eat']]

  return (
    <section className="discover">
      <div className="discover-top">
        <div className="discover-globe"><Globe spinning={spinning} dest={dest} /></div>
        <div className="discover-body">
          {!dest && <>
            <span className="lp-eyebrow">Need inspiration?</span>
            <h2>Spin the globe</h2>
            <p className="muted">Let the world choose. We’ll land on a destination and the AI will design the whole holiday — where to stay, what to see, and where to eat. Real places, no invented prices.</p>
          </>}
          {dest && <>
            <span className="lp-eyebrow">{spinning ? 'Spinning…' : 'Your destination'}</span>
            <h2 className="discover-dest">{spinning ? 'Somewhere amazing…' : `${dest.name}, ${dest.country}`}</h2>
            {!spinning && <p className="muted">{dest.blurb} · suggested {dest.days} days</p>}
          </>}
          {err && <div className="banner warn">{err}</div>}
          <div className="discover-actions">
            <button className="btn primary" onClick={spin} disabled={spinning || phase === 'planning'}>
              {spinning ? 'Spinning…' : dest ? 'Spin again' : 'Spin the globe'}
            </button>
            {phase === 'landed' &&
              <button className="btn" onClick={designHoliday}>Design my holiday ✨</button>}
          </div>
        </div>
      </div>

      {phase === 'planning' &&
        <div className="discover-plan">
          <p className="muted">Designing your {dest.name} holiday — finding stays, sights and food…</p>
          <PlaceCardsSkeleton n={3} />
        </div>}

      {phase === 'planned' &&
        <div className="discover-plan">
          {plan.reply && <p className="planner-reply discover-reply">{plan.reply}</p>}
          {SECTIONS.map(([k, title]) => groups[k].length > 0 && (
            <div className="discover-section" key={k}>
              <h3>{title}</h3>
              <StaggerList className="place-grid">
                {groups[k].map((c, i) => <PlaceCard c={c} key={c.google_place_id || k + i} />)}
              </StaggerList>
            </div>
          ))}
          <div className="discover-actions">
            <button className="btn primary" onClick={createTrip} disabled={creating}>
              {creating ? 'Creating…' : `Create my ${dest.name} trip`}
            </button>
            <span className="muted">Saves all of these as ideas on a new trip you can refine.</span>
          </div>
        </div>}
    </section>
  )
}
