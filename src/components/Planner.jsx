import { useEffect, useState, useCallback } from 'react'
import { askPlanner, cardPrice } from '../lib/planner'
import { listSavedPlaces, savePlace, removeSavedPlace, addPlaceToItinerary } from '../lib/savedPlaces'
import { bookingLink } from '../lib/bookingLinks'
import { PlaceCardsSkeleton } from './Skeleton'
import { useDynamicImage } from '../hooks/useDynamicImage'
import { StaggerList } from './motion'
import { supabase } from '../lib/supabase'

// Compact, model-friendly summary of the trip + what's already booked, so the
// planner builds around the existing itinerary instead of suggesting in a vacuum.
function buildTripContext(trip, bookings) {
  const lines = []
  if (trip) {
    lines.push(`Trip: ${trip.name || 'Untitled'}. Dates: ${trip.start_date || '?'} to ${trip.end_date || '?'}. Travellers: ${trip.travelers || 1}. Base currency: ${trip.base_currency || ''}.`)
  }
  const rows = (bookings || []).slice(0, 40)
  if (rows.length) {
    lines.push('Already booked or planned (build around these, do not repeat them):')
    for (const b of rows) {
      const bits = [b.title, b.category, b.date].filter(Boolean)
      lines.push(`- [${b.status || 'TO BOOK'}] ${bits.join(' · ')}`)
    }
  } else {
    lines.push('No bookings captured yet.')
  }
  return lines.join('\n')
}

// Google's own photo is the most accurate; when a card comes back without one,
// fall back to a place-named Unsplash photo rather than an empty grey block.
function PlacePhoto({ card }) {
  const img = useDynamicImage(card.photo_url ? '' : card.name, null)
  if (card.photo_url)
    return <div className="place-photo" style={{ backgroundImage: `url(${card.photo_url})` }} role="img" aria-label={card.name} />
  if (img.src)
    return (
      <div className="place-photo" style={{ backgroundImage: `url(${img.src})` }} role="img" aria-label={card.name}>
        {img.author_url &&
          <a className="photo-credit" href={img.author_url} target="_blank" rel="noreferrer noopener">Photo: {img.author}</a>}
      </div>
    )
  return <div className="place-photo placeholder" aria-hidden="true" />
}

// Grounded AI planner: ask for ideas, get real Google-sourced place cards, save
// the good ones. Prices/hours are never invented — cards show only Google fields.
export default function Planner({ tripId, trip }) {
  const [message, setMessage] = useState('')
  const [turns, setTurns] = useState([])      // {role, text} history for the model
  const [reply, setReply] = useState('')
  const [cards, setCards] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState([])
  const [bookings, setBookings] = useState([])

  const loadSaved = useCallback(async () => {
    const { data } = await listSavedPlaces(tripId)
    setSaved(data || [])
  }, [tripId])
  useEffect(() => { loadSaved() }, [loadSaved])

  // Load the trip's bookings so the planner can ground suggestions in the itinerary.
  useEffect(() => {
    supabase.from('bookings').select('title,category,date,status')
      .eq('trip_id', tripId).order('date', { ascending: true })
      .then(({ data }) => setBookings(data || []))
  }, [tripId])

  const savedIds = new Set(saved.map(s => s.google_place_id).filter(Boolean))

  async function ask(e) {
    e?.preventDefault()
    const q = message.trim()
    if (!q || busy) return
    setBusy(true); setErr(''); setReply('')
    const history = turns.slice(-6)
    const context = buildTripContext(trip, bookings)
    const { reply, cards, error } = await askPlanner(q, history, { context })
    setBusy(false)
    if (error) { setErr(error.message || 'The planner had trouble. Try again.'); return }
    setTurns(t => [...t, { role: 'user', text: q }, { role: 'assistant', text: reply }])
    setReply(reply)
    setCards(cards)
    setMessage('')
  }

  async function save(card) {
    const { data, error } = await savePlace(tripId, card)
    if (!error && data) setSaved(s => [...s, data])
  }
  async function unsave(place) {
    await removeSavedPlace(place.id)
    setSaved(s => s.filter(p => p.id !== place.id))
  }
  async function addToItinerary(place) {
    setErr('')
    const { error } = await addPlaceToItinerary(trip || { id: tripId }, place)
    if (error) setErr(error.message)
    else setSaved(s => s.map(p => p.id === place.id ? { ...p, status: 'added_to_itinerary' } : p))
  }

  return (
    <div className="planner">
      <form className="planner-ask card" onSubmit={ask}>
        <input
          placeholder="Ask for ideas — e.g. “fill my free days” or “dinner near where I’m staying”"
          value={message} onChange={e => setMessage(e.target.value)} />
        <button className="btn primary" disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {bookings.length > 0 &&
        <p className="muted planner-ctx">Tailored to <b>{trip?.name || 'your trip'}</b> — {bookings.length} booking{bookings.length === 1 ? '' : 's'} in context.</p>}

      {err && <div className="banner warn">{err}</div>}
      {busy && <PlaceCardsSkeleton n={3} />}
      {!busy && reply && <p className="planner-reply">{reply}</p>}

      {cards.length > 0 &&
        // Keyed by the result set so a new answer replays the stagger (the list
        // stays mounted across asks otherwise, and fresh cards would just appear).
        <StaggerList className="place-grid" key={cards.map(c => c.google_place_id).join(',')}>
          {cards.map((c, i) => {
            const already = c.google_place_id && savedIds.has(c.google_place_id)
            return (
              <article className="place-card card" key={c.google_place_id || i}>
                <PlacePhoto card={c} />
                <div className="place-body">
                  <div className="place-head">
                    <h4>{c.name}</h4>
                    <span className="chip">{c.category}</span>
                  </div>
                  <div className="place-meta">
                    {c.rating != null && <span className="num">{c.rating.toFixed(1)} ★{c.user_ratings_total != null ? ` · ${c.user_ratings_total.toLocaleString()}` : ''}</span>}
                    {cardPrice(c) && <span className="num">{cardPrice(c)}</span>}
                  </div>
                  {c.why && <p className="place-why">{c.why}</p>}
                  <div className="place-foot">
                    <span className="fresh">via Google · {fmtDate(c.fetched_at)}</span>
                    {c.maps_url && <a href={c.maps_url} target="_blank" rel="noreferrer">Map</a>}
                    <button className="btn ghost" disabled={already} onClick={() => save(c)}>{already ? 'Saved ✓' : 'Save idea'}</button>
                  </div>
                </div>
              </article>
            )
          })}
        </StaggerList>}

      <h3 className="saved-h">Saved ideas{saved.length ? ` (${saved.length})` : ''}</h3>
      {saved.length === 0
        ? <p className="muted">Ideas you save appear here, ready to add to your itinerary.</p>
        : <ul className="saved-list">
          {saved.map(p => {
            const added = p.status === 'added_to_itinerary'
            return (
              <li key={p.id}>
                <span className={'badge ' + (added ? 'booked' : 'optional')}>{added ? 'in itinerary' : p.status}</span>
                <span className="saved-name">{p.name}</span>
                <span className="muted">{p.category}</span>
                <a href={bookingLink(p, trip || {})} target="_blank" rel="noreferrer">Book now ↗</a>
                {added
                  ? <span className="muted">✓ added</span>
                  : <button className="btn ghost" onClick={() => addToItinerary(p)}>Add to itinerary</button>}
                <button className="btn ghost danger" onClick={() => unsave(p)}>✕</button>
              </li>
            )
          })}
        </ul>}
    </div>
  )
}

function fmtDate(iso) {
  if (!iso) return 'today'
  const d = new Date(iso)
  if (isNaN(d)) return 'today'
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(d)
}
