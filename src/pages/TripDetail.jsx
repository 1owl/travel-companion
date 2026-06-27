import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BookingLedger from '../components/BookingLedger'
import BudgetEngine from '../components/BudgetEngine'
import LiveItinerary from '../components/LiveItinerary'
import Planner from '../components/Planner'
import Flights from '../components/Flights'
import Stays from '../components/Stays'
import { StatsSkeleton, RowsSkeleton } from '../components/Skeleton'
import { fmt } from '../lib/currency'
import { coverFor } from '../lib/photos'
import { coverQuery } from '../lib/images'
import { useDynamicImage } from '../hooks/useDynamicImage'

// Phase 5 is behind a feature flag (on by default; set VITE_FEATURE_FLIGHTS=false to hide).
const FLIGHTS_ENABLED = import.meta.env.VITE_FEATURE_FLIGHTS !== 'false'

export default function TripDetail() {
  const { id } = useParams()
  const [trip, setTrip] = useState(null)
  const [tab, setTab] = useState('bookings')
  const [totals, setTotals] = useState({ budget: 0, booked: 0 })

  useEffect(() => {
    supabase.from('trips').select('*').eq('id', id).single().then(({ data }) => setTrip(data))
  }, [id])

  // Stable callbacks that no-op when the value is unchanged — otherwise the
  // child effects (which depend on onTotal) re-fire every render and loop.
  const onBudget = useCallback(v => setTotals(t => t.budget === v ? t : { ...t, budget: v }), [])
  const onBooked = useCallback(v => setTotals(t => t.booked === v ? t : { ...t, booked: v }), [])

  const cover = useDynamicImage(coverQuery(trip), coverFor(trip))

  if (!trip) return (
    <div className="page">
      <header className="topbar"><div><Link to="/app">← Trips</Link></div></header>
      <main className="container"><StatsSkeleton /><RowsSkeleton n={6} /></main>
    </div>
  )
  const base = trip.base_currency

  return (
    <div className="page">
      <header className="topbar">
        <div><Link to="/app">← Trips</Link> &nbsp; <b>{trip.name}</b></div>
        <div className="muted">{trip.travelers} traveller(s) · base {base}</div>
      </header>
      <main className="container">
        <div className="td-cover" style={{ backgroundImage: `url(${cover.src})` }}>
          <div className="td-cover-copy">
            <h2>{trip.name}</h2>
            <p className="num">{trip.start_date || '—'} → {trip.end_date || '—'}</p>
          </div>
          {cover.author_url &&
            <a className="photo-credit" href={cover.author_url} target="_blank" rel="noreferrer noopener">Photo: {cover.author}</a>}
        </div>
        {tab !== 'itinerary' && tab !== 'planner' && tab !== 'flights' && tab !== 'stays' &&
          <div className="cards">
            <div className="stat"><div className="k">Budget total</div><div className="v">{fmt(totals.budget, base)}</div></div>
            <div className="stat"><div className="k">Per person</div><div className="v">{fmt(totals.budget / (trip.travelers || 1), base)}</div></div>
            <div className="stat"><div className="k">Booked / tracked</div><div className="v">{fmt(totals.booked, base)}</div></div>
          </div>}
        <div className="tabs">
          <button className={tab === 'itinerary' ? 'active' : ''} onClick={() => setTab('itinerary')}>Itinerary</button>
          <button className={tab === 'bookings' ? 'active' : ''} onClick={() => setTab('bookings')}>Booking ledger</button>
          <button className={tab === 'budget' ? 'active' : ''} onClick={() => setTab('budget')}>Budget engine</button>
          <button className={tab === 'planner' ? 'active' : ''} onClick={() => setTab('planner')}>Planner</button>
          {FLIGHTS_ENABLED && <button className={tab === 'flights' ? 'active' : ''} onClick={() => setTab('flights')}>Flights</button>}
          {FLIGHTS_ENABLED && <button className={tab === 'stays' ? 'active' : ''} onClick={() => setTab('stays')}>Stays</button>}
        </div>
        <div className="fade-in" key={tab}>
          {tab === 'bookings' &&
            <BookingLedger tripId={id} base={base} onTotal={onBooked} />}
          {tab === 'budget' &&
            <BudgetEngine tripId={id} base={base} travelers={trip.travelers} onTotal={onBudget} />}
          {tab === 'itinerary' &&
            <LiveItinerary tripId={id} base={base} startISO={trip.start_date} travelers={trip.travelers} />}
          {tab === 'planner' &&
            <Planner tripId={id} trip={trip} />}
          {tab === 'flights' && FLIGHTS_ENABLED &&
            <Flights tripId={id} trip={trip} />}
          {tab === 'stays' && FLIGHTS_ENABLED &&
            <Stays tripId={id} trip={trip} />}
        </div>
      </main>
    </div>
  )
}
