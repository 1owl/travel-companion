import { useEffect, useState, useCallback } from 'react'
import { searchFlights, rankOffers, formatDuration } from '../lib/flights'
import { listQuotes, saveQuote, removeQuote } from '../lib/priceQuotes'
import { detectNearestAirport } from '../lib/airports'
import { fmt } from '../lib/currency'
import { RowsSkeleton } from './Skeleton'
import { StaggerList } from './motion'

// Phase 5: flight price comparison. Options to compare — each tagged with its
// source + freshness; booking deep-links out. A single slider re-ranks live
// between cheapest and most comfortable.
export default function Flights({ tripId, trip }) {
  const [form, setForm] = useState({
    origin: '', destination: '',
    depart_date: trip?.start_date || '', return_date: trip?.end_date || '', adults: trip?.travelers || 1,
  })
  const [results, setResults] = useState([])
  const [weight, setWeight] = useState(1) // 1 = cheapest, 0 = comfort
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fetchedAt, setFetchedAt] = useState(null)
  const [saved, setSaved] = useState([])
  const [originNote, setOriginNote] = useState('')
  const [isTest, setIsTest] = useState(false)

  const loadSaved = useCallback(async () => {
    const { data } = await listQuotes(tripId)
    setSaved(data || [])
  }, [tripId])
  useEffect(() => { loadSaved() }, [loadSaved])

  // Auto-fill the origin from the traveller's location (nearest major airport).
  // Only if they haven't typed one; on deny/unavailable we leave it blank.
  useEffect(() => {
    let alive = true
    detectNearestAirport().then(a => {
      if (!alive || !a) return
      setForm(f => f.origin ? f : { ...f, origin: a.iata })
      setOriginNote(`From set to ${a.iata} (${a.city}) — nearest to you. Change it any time.`)
    })
    return () => { alive = false }
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function search(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true); setErr(''); setResults([])
    const { results, fetched_at, test, error } = await searchFlights({
      origin: form.origin, destination: form.destination,
      depart_date: form.depart_date, return_date: form.return_date, adults: Number(form.adults) || 1,
    })
    setBusy(false)
    setIsTest(!!test)
    if (error) { setErr(error.message || 'Flight search failed.'); return }
    if (!results.length) { setErr('No flights found for those details. Try different dates or airports.'); return }
    setResults(results); setFetchedAt(fetched_at)
  }

  async function save(offer) {
    const { data, error } = await saveQuote(trip || { id: tripId }, offer, form)
    if (!error && data) setSaved(s => [data, ...s])
  }
  async function unsave(q) {
    await removeQuote(q.id)
    setSaved(s => s.filter(x => x.id !== q.id))
  }

  const ranked = rankOffers(results, weight)

  return (
    <div className="flights">
      <form className="card flights-form" onSubmit={search}>
        <input placeholder="From (e.g. LON)" value={form.origin} onChange={e => set('origin', e.target.value)} maxLength={3} style={{ width: 110, textTransform: 'uppercase' }} required />
        <input placeholder="To (e.g. PAR)" value={form.destination} onChange={e => set('destination', e.target.value)} maxLength={3} style={{ width: 110, textTransform: 'uppercase' }} required />
        <label className="f-lbl">Depart<input type="date" value={form.depart_date} onChange={e => set('depart_date', e.target.value)} required /></label>
        <label className="f-lbl">Return<input type="date" value={form.return_date} onChange={e => set('return_date', e.target.value)} /></label>
        <input type="number" min="1" max="9" value={form.adults} onChange={e => set('adults', e.target.value)} title="adults" style={{ width: 64 }} />
        <button className="btn primary" disabled={busy}>{busy ? 'Searching…' : 'Find flights'}</button>
      </form>
      {originNote && <p className="muted f-loc">📍 {originNote}</p>}

      {err && <div className="banner warn">{err}</div>}
      {busy && <RowsSkeleton n={5} />}

      {results.length > 0 && !busy &&
        <>
          {isTest && <div className="banner test-banner">⚠️ TEST DATA — simulated Duffel fares, not bookable. Do not treat as real prices.</div>}
          <div className="flights-rank">
            <span className="muted">Cheapest</span>
            <input type="range" min="0" max="1" step="0.1" value={weight} onChange={e => setWeight(Number(e.target.value))} aria-label="Cheapest to comfort" />
            <span className="muted">Most comfortable</span>
            {fetchedAt && <span className="fresh">via Duffel · fetched {fmtTime(fetchedAt)} · not guaranteed live</span>}
          </div>
          <table className="data">
            <thead><tr><th>Airline</th><th>Depart</th><th>Arrive</th><th>Stops</th><th>Duration</th><th>Price</th><th></th></tr></thead>
            {/* Rows stagger in on a new search; re-ranking (the slider) reorders an
                already-revealed list, so it doesn't re-animate. */}
            <StaggerList as="tbody">
              {ranked.map((o, i) => (
                <tr key={o.id || i}>
                  <td>{o.airline}</td>
                  <td className="num">{fmtTime(o.depart_at)}</td>
                  <td className="num">{fmtTime(o.arrive_at)}</td>
                  <td className="num">{o.stops === 0 ? 'Direct' : `${o.stops}`}</td>
                  <td className="num">{formatDuration(o.duration)}</td>
                  <td className="num">{fmt(o.price, o.currency)}</td>
                  <td className="nowrap">
                    <a className="btn ghost" href={o.deep_link} target="_blank" rel="noreferrer">Book ↗</a>
                    <button className="btn ghost" onClick={() => save(o)}>Save</button>
                  </td>
                </tr>
              ))}
            </StaggerList>
          </table>
        </>}

      <h3 className="saved-h">Saved options{saved.length ? ` (${saved.length})` : ''}</h3>
      {saved.length === 0
        ? <p className="muted">Save options to compare them later — each keeps its price and the time it was fetched.</p>
        : <ul className="saved-list">
          {saved.map(q => (
            <li key={q.id}>
              <span className="saved-name">{q.title}</span>
              <span className="num">{fmt(q.price, q.currency)}</span>
              <span className="fresh">fetched {fmtTime(q.fetched_at)}</span>
              {q.deep_link && <a href={q.deep_link} target="_blank" rel="noreferrer">Book ↗</a>}
              <button className="btn ghost danger" onClick={() => unsave(q)}>✕</button>
            </li>
          ))}
        </ul>}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(d)
}
