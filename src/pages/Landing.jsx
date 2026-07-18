import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RouteMap } from '../components/Art'
import { PHOTOS } from '../lib/photos'
import { asset } from '../lib/asset'
import { pickLandingPhoto } from '../lib/landingPhotos'
import StatsBoard from '../components/StatsBoard'
import { RevealOnScroll, StaggerList, prefersReducedMotion } from '../components/motion'

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

// className/style are forwarded so this tile can be a StaggerList child — the
// primitive clones the step onto its children, and a component that swallowed
// them would silently never animate.
// The photo comes from the pre-fetched pool (no network call on the public
// landing — see src/lib/landingPhotos.js), picked once so it doesn't reshuffle
// on re-render.
function GalleryTile({ dest, fallback, className = '', style }) {
  const img = useMemo(() => pickLandingPhoto(dest.q, fallback), [dest.q, fallback])
  return (
    <figure className={['lp-shot', className].filter(Boolean).join(' ')} style={style}>
      <img src={img.src} alt={`${dest.place}, ${dest.region}`} loading="lazy" />
      <figcaption><b>{dest.place}</b><span>{dest.region}</span></figcaption>
      {img.author_url &&
        <a className="photo-credit" href={img.author_url} target="_blank" rel="noreferrer noopener">Photo: {img.author}</a>}
    </figure>
  )
}

// Public marketing site. One design system with the app (DESIGN tokens), dressed
// up editorial-premium. All motion comes from the shared motion layer
// (src/components/motion) — reveals, stagger and reduced-motion handling — so the
// landing speaks the same language as the app rather than its own dialect.

function useParallax() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => document.documentElement.style.setProperty('--sy', String(window.scrollY)))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
}

const FEATURES = [
  { k: 'Booking ledger', t: 'Every booking in one ledger', img: asset('shots/ledger.png'),
    d: 'Flights, trains, stays and tickets — title, date, status, cost and a link, synced to the cloud. Flip TO BOOK → BOOKED and tick paid as you go.' },
  { k: 'Budget engine', t: 'Multi-currency totals, to the cent', img: asset('shots/budget.png'),
    d: 'Quantity × price × live FX, summed into your home currency with a per-person split and category subtotals. Numbers set in mono so columns line up and read true.' },
  { k: 'AI planner', t: 'Ideas grounded in real places', img: asset('shots/planner.png'),
    d: '“What should I see in Annecy?” → real, current places from Google with photos, ratings, a one-line why and a source + freshness badge. It never invents a price.' },
  { k: 'Live itinerary', t: 'Your whole trip on one screen', img: asset('shots/itinerary.png'),
    d: 'A day-by-day timeline of everything booked and planned, with status at a glance, map links per stop, and an offline cache for patchy travel signal.' },
]

export default function Landing() {
  useParallax()
  const picks = useMemo(() => shuffle(DESTINATIONS).slice(0, 4), [])
  const cta = useMemo(() => pickLandingPhoto('travel landscape scenic', PHOTOS[0].src), [])

  return (
    <div className="lp">
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
        <RevealOnScroll className="lp-hero-copy">
          <span className="lp-eyebrow">The calm travel companion</span>
          <h1>Plan the trip.<br /><em>Keep the calm.</em></h1>
          <p>The scattered confirmation emails, half-remembered ideas and currency maths of a trip — gathered into one quiet surface you can open and trust.</p>
          <div className="lp-hero-actions">
            <Link className="btn primary" to="/app">Start planning — free</Link>
            <a className="btn ghost" href="#features">See how it works</a>
          </div>
          <p className="lp-note">No card required · Your data stays private</p>
        </RevealOnScroll>
        {/* A beat behind the copy — the eye lands on the words first. */}
        <RevealOnScroll className="lp-hero-art" delay={120}>
          <RouteMap />
          <img src={asset('shots/itinerary.png')} alt="The live itinerary for a France 2026 trip" loading="eager" />
        </RevealOnScroll>
      </header>

      {/* Problem strip */}
      <RevealOnScroll as="section" className="lp-strip">
        <p>A trip shouldn’t live in twelve browser tabs, three inboxes and a notes app.</p>
        <div className="lp-strip-points">
          <span>Confirmations buried in email</span>
          <span>Budgets guessed across currencies</span>
          <span>Ideas you forget by departure</span>
        </div>
      </RevealOnScroll>

      {/* Features */}
      <section className="lp-features" id="features">
        {FEATURES.map((f, i) => (
          <RevealOnScroll className={'lp-feature' + (i % 2 ? ' rev' : '')} key={f.k}>
            <div className="lp-feature-text">
              <span className="lp-label">{f.k}</span>
              <h2>{f.t}</h2>
              <p>{f.d}</p>
            </div>
            <div className="lp-feature-shot">
              <img src={f.img} alt={f.t} loading="lazy" />
            </div>
          </RevealOnScroll>
        ))}
      </section>

      {/* Destinations gallery — the head reveals, then the tiles step in. Revealing
          the whole section as one block on top of that would double the motion. */}
      <section className="lp-gallery">
        <RevealOnScroll className="lp-gallery-head">
          <span className="lp-label">Wherever you’re going</span>
          <h2>Made for the places worth the planning</h2>
          <p>From a Riviera harbour to an overwater sunset — keep every booking, idea and number for the trip in one calm place.</p>
        </RevealOnScroll>
        <StaggerList className="lp-gallery-grid">
          {picks.map((d, i) => (
            <GalleryTile key={d.place} dest={d} fallback={PHOTOS[i % PHOTOS.length].src} />
          ))}
        </StaggerList>
      </section>

      {/* Stats band — airport split-flap board */}
      <StatsBoard />

      {/* Testimonial */}
      <RevealOnScroll as="section" className="lp-quote">
        <blockquote>“It turned the noise of a two-week trip into one screen I actually trust.”</blockquote>
        <cite>— Built for travellers who plan like a spreadsheet and feel like a postcard</cite>
      </RevealOnScroll>

      {/* Pricing */}
      <section className="lp-pricing" id="pricing">
        <RevealOnScroll as="h2">Simple pricing</RevealOnScroll>
        <StaggerList className="lp-plans">
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
        </StaggerList>
      </section>

      {/* CTA */}
      <RevealOnScroll as="section" className="lp-final photo" style={{ '--cta-photo': `url(${cta.src})` }}>
        <div className="lp-final-inner">
          <h2>Your next trip, in one calm place.</h2>
          <Link className="btn primary" to="/app">Open the app</Link>
          {cta.author_url &&
            <a className="photo-credit" href={cta.author_url} target="_blank" rel="noreferrer noopener">Photo: {cta.author}</a>}
        </div>
      </RevealOnScroll>

      <footer className="lp-foot">
        <span>Travel Companion</span>
        <span className="muted">Plan · book · track · budget — all in one place.</span>
      </footer>
    </div>
  )
}
