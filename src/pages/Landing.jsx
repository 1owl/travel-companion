import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RouteMap } from '../components/Art'
import { PHOTOS } from '../lib/photos'
import { useDynamicImage } from '../hooks/useDynamicImage'

// A rotating pool of evocative destinations for the gallery — a different four
// surface on each visit, each backed by a live photo (local placeholder as fallback).
const DESTINATIONS = [
  { place: 'Santorini', region: 'Greece', q: 'Santorini Greece' },
  { place: 'Kyoto', region: 'Japan', q: 'Kyoto Japan' },
  { place: 'Amalfi Coast', region: 'Italy', q: 'Amalfi Coast Italy' },
  { place: 'Banff', region: 'Canada', q: 'Banff Canada mountains' },
  { place: 'Marrakesh', region: 'Morocco', q: 'Marrakesh Morocco' },
  { place: 'Saint-Tropez', region: 'Côte d’Azur', q: 'Saint Tropez France' },
  { place: 'Maldives', region: 'Indian Ocean', q: 'Maldives beach' },
  { place: 'Lisbon', region: 'Portugal', q: 'Lisbon Portugal' },
  { place: 'Queenstown', region: 'New Zealand', q: 'Queenstown New Zealand' },
  { place: 'Reykjavík', region: 'Iceland', q: 'Iceland landscape' },
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function GalleryTile({ dest, fallback }) {
  const img = useDynamicImage(dest.q, fallback)
  return (
    <figure className="lp-shot">
      <img src={img.src} alt={`${dest.place}, ${dest.region}`} loading="lazy" />
      <figcaption><b>{dest.place}</b><span>{dest.region}</span></figcaption>
      {img.author_url &&
        <a className="photo-credit" href={img.author_url} target="_blank" rel="noreferrer noopener">Photo: {img.author}</a>}
    </figure>
  )
}

// Public marketing site. One design system with the app (DESIGN tokens), dressed
// up editorial-premium. Motion is tasteful: reveal-on-scroll + a light hero
// parallax, both disabled under prefers-reduced-motion.

const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const els = ref.current?.querySelectorAll('[data-reveal]')
    if (!els?.length) return
    if (reduceMotion()) { els.forEach(el => el.classList.add('in')); return }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

function useParallax() {
  useEffect(() => {
    if (reduceMotion()) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => document.documentElement.style.setProperty('--sy', String(window.scrollY)))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
}

function CountUp({ to, prefix = '', suffix = '', decimals = 0 }) {
  const ref = useRef(null)
  const [val, setVal] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion()) { setVal(to); return }
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      const start = performance.now(), dur = 1100
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        setVal(to * eased)
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [to])
  return <span ref={ref}>{prefix}{val.toLocaleString('en-AU', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</span>
}

const FEATURES = [
  { k: 'Booking ledger', t: 'Every booking in one ledger', img: '/shots/ledger.png',
    d: 'Flights, trains, stays and tickets — title, date, status, cost and a link, synced to the cloud. Flip TO BOOK → BOOKED and tick paid as you go.' },
  { k: 'Budget engine', t: 'Multi-currency totals, to the cent', img: '/shots/budget.png',
    d: 'Quantity × price × live FX, summed into your home currency with a per-person split and category subtotals. Numbers set in mono so columns line up and read true.' },
  { k: 'AI planner', t: 'Ideas grounded in real places', img: '/shots/planner.png',
    d: '“What should I see in Annecy?” → real, current places from Google with photos, ratings, a one-line why and a source + freshness badge. It never invents a price.' },
  { k: 'Live itinerary', t: 'Your whole trip on one screen', img: '/shots/itinerary.png',
    d: 'A day-by-day timeline of everything booked and planned, with status at a glance, map links per stop, and an offline cache for patchy travel signal.' },
]

export default function Landing() {
  const ref = useReveal()
  useParallax()
  const picks = useMemo(() => shuffle(DESTINATIONS).slice(0, 4), [])
  const cta = useDynamicImage('travel landscape scenic', PHOTOS[0].src)

  return (
    <div className="lp" ref={ref}>
      <nav className="lp-nav">
        <a className="lp-brand" href="#top">Travel&nbsp;Companion</a>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <Link className="btn primary lp-cta" to="/app">Open app</Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="lp-hero" id="top">
        <div className="lp-hero-copy" data-reveal>
          <span className="lp-eyebrow">The calm travel companion</span>
          <h1>Plan the trip.<br /><em>Keep the calm.</em></h1>
          <p>The scattered confirmation emails, half-remembered ideas and currency maths of a trip — gathered into one quiet surface you can open and trust.</p>
          <div className="lp-hero-actions">
            <Link className="btn primary" to="/app">Start planning — free</Link>
            <a className="btn ghost" href="#features">See how it works</a>
          </div>
          <p className="lp-note">No card required · Your data stays private</p>
        </div>
        <div className="lp-hero-art" data-reveal>
          <RouteMap />
          <img src="/shots/itinerary.png" alt="The live itinerary for a France 2026 trip" loading="eager" />
        </div>
      </header>

      {/* Problem strip */}
      <section className="lp-strip" data-reveal>
        <p>A trip shouldn’t live in twelve browser tabs, three inboxes and a notes app.</p>
        <div className="lp-strip-points">
          <span>Confirmations buried in email</span>
          <span>Budgets guessed across currencies</span>
          <span>Ideas you forget by departure</span>
        </div>
      </section>

      {/* Features */}
      <section className="lp-features" id="features">
        {FEATURES.map((f, i) => (
          <div className={'lp-feature' + (i % 2 ? ' rev' : '')} key={f.k} data-reveal>
            <div className="lp-feature-text">
              <span className="lp-label">{f.k}</span>
              <h2>{f.t}</h2>
              <p>{f.d}</p>
            </div>
            <div className="lp-feature-shot">
              <img src={f.img} alt={f.t} loading="lazy" />
            </div>
          </div>
        ))}
      </section>

      {/* Destinations gallery */}
      <section className="lp-gallery" data-reveal>
        <div className="lp-gallery-head">
          <span className="lp-label">Wherever you’re going</span>
          <h2>Made for the places worth the planning</h2>
          <p>From a Riviera harbour to an overwater sunset — keep every booking, idea and number for the trip in one calm place.</p>
        </div>
        <div className="lp-gallery-grid">
          {picks.map((d, i) => (
            <GalleryTile key={d.place} dest={d} fallback={PHOTOS[i % PHOTOS.length].src} />
          ))}
        </div>
      </section>

      {/* Stats band */}
      <section className="lp-stats" data-reveal>
        <div className="lp-stat"><b className="num"><CountUp to={8043} prefix="A$" /></b><span>planned, to the cent</span></div>
        <div className="lp-stat"><b className="num"><CountUp to={19} /></b><span>bookings tracked</span></div>
        <div className="lp-stat"><b className="num"><CountUp to={5} /></b><span>destinations, one timeline</span></div>
        <div className="lp-stat"><b className="num"><CountUp to={6} suffix=" currencies" /></b><span>converted live</span></div>
      </section>

      {/* Testimonial */}
      <section className="lp-quote" data-reveal>
        <blockquote>“It turned the noise of a two-week trip into one screen I actually trust.”</blockquote>
        <cite>— Built for travellers who plan like a spreadsheet and feel like a postcard</cite>
      </section>

      {/* Pricing */}
      <section className="lp-pricing" id="pricing" data-reveal>
        <h2>Simple pricing</h2>
        <div className="lp-plans">
          <div className="lp-plan">
            <span className="lp-label">Free</span>
            <div className="lp-price num">A$0</div>
            <ul>
              <li>Unlimited trips & bookings</li>
              <li>Multi-currency budget engine</li>
              <li>Attachment vault</li>
              <li>Live itinerary</li>
            </ul>
            <Link className="btn ghost" to="/app">Get started</Link>
          </div>
          <div className="lp-plan featured">
            <span className="lp-label">Pro</span>
            <div className="lp-price num">A$49<small>/yr</small></div>
            <ul>
              <li>Everything in Free</li>
              <li>AI destination planner</li>
              <li>Confirmation auto-import</li>
              <li>Priority support</li>
            </ul>
            <Link className="btn primary" to="/app">Go Pro</Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-final photo" data-reveal style={{ '--cta-photo': `url(${cta.src})` }}>
        <div className="lp-final-inner">
          <h2>Your next trip, in one calm place.</h2>
          <Link className="btn primary" to="/app">Open the app</Link>
          {cta.author_url &&
            <a className="photo-credit" href={cta.author_url} target="_blank" rel="noreferrer noopener">Photo: {cta.author}</a>}
        </div>
      </section>

      <footer className="lp-foot">
        <span>Travel Companion</span>
        <span className="muted">Plan · book · track · budget — all in one place.</span>
      </footer>
    </div>
  )
}
