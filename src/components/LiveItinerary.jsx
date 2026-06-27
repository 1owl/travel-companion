import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toBase, fmt, sumBudget } from '../lib/currency'
import { groupByDay, formatTime, daysUntil } from '../lib/tripDates'
import { statusClass } from '../lib/status'
import { saveItinerary, loadItinerary } from '../lib/itineraryCache'
import BookingDrawer from './BookingDrawer'
import { EmptyState } from './Art'
import { RowsSkeleton } from './Skeleton'

const STATUS_FILTERS = ['ALL', 'TO BOOK', 'BOOKED', 'OPTIONAL', 'CHECK']

// One screen for the whole trip: bookings grouped by day, a budget/booked
// snapshot, map links, and an offline cache so it still renders on bad signal.
export default function LiveItinerary({ tripId, base, startISO, travelers }) {
  const [bookings, setBookings] = useState([])
  const [budgetTotal, setBudgetTotal] = useState(0)
  const [attachIds, setAttachIds] = useState(new Set())
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [openBooking, setOpenBooking] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const bq = await supabase.from('bookings').select('*').eq('trip_id', tripId).order('created_at')
    if (bq.error) {
      const cached = loadItinerary(tripId)
      if (cached) {
        setBookings(cached.bookings || [])
        setBudgetTotal(cached.budgetTotal || 0)
        setAttachIds(new Set(cached.attachBookingIds || []))
        setOffline(true)
      }
      setLoading(false)
      return
    }
    const [biq, aq] = await Promise.all([
      supabase.from('budget_items').select('qty,unit_price,currency').eq('trip_id', tripId),
      supabase.from('attachments').select('booking_id').eq('trip_id', tripId),
    ])
    const bookingsData = bq.data || []
    const total = sumBudget(biq.data || [], base)
    const ids = (aq.data || []).map(a => a.booking_id).filter(Boolean)
    setBookings(bookingsData)
    setBudgetTotal(total)
    setAttachIds(new Set(ids))
    setOffline(false)
    saveItinerary(tripId, {
      at: new Date().toISOString(),
      bookings: bookingsData, budgetTotal: total, attachBookingIds: ids,
    })
    setLoading(false)
  }, [tripId, base])
  useEffect(() => { load() }, [load])

  const categories = ['ALL', ...Array.from(new Set(bookings.map(b => b.category).filter(Boolean)))]
  const filtered = bookings.filter(b =>
    (status === 'ALL' || b.status === status) &&
    (category === 'ALL' || b.category === category))
  const groups = groupByDay(filtered, startISO)

  const bookedCount = bookings.filter(b => b.status === 'BOOKED').length
  const toBookCount = bookings.filter(b => b.status === 'TO BOOK').length
  const dleft = daysUntil(startISO)

  if (loading) return <RowsSkeleton n={6} />

  return (
    <div>
      {offline && <div className="banner warn">Showing cached itinerary — couldn’t reach the server.</div>}

      <div className="cards">
        <div className="stat"><div className="k">Days to go</div><div className="v">{dleft == null ? '—' : (dleft >= 0 ? dleft : 'underway')}</div></div>
        <div className="stat"><div className="k">Booked</div><div className="v">{bookedCount}<span className="muted"> / {bookings.length}</span></div></div>
        <div className="stat"><div className="k">To book</div><div className="v">{toBookCount}</div></div>
        <div className="stat"><div className="k">Budget total</div><div className="v">{fmt(budgetTotal, base)}</div></div>
        <div className="stat"><div className="k">Per person</div><div className="v">{fmt(budgetTotal / (travelers || 1), base)}</div></div>
      </div>

      <div className="itin-filters">
        <label>Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_FILTERS.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Category
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {groups.length === 0 && <EmptyState kind="itinerary">No bookings match these filters.</EmptyState>}

      {groups.map(g => (
        <div className="card day" key={g.key}>
          <h3 className={g.key === 'unscheduled' ? 'muted' : ''}>{g.heading}</h3>
          <ul className="timeline">
            {g.items.map(b => {
              const t = formatTime(b)
              return (
                <li key={b.id}>
                  <span className="t-time">{t || '—'}</span>
                  <span className={'badge ' + statusClass(b.status)}>{b.status}</span>
                  <button className="linklike t-title" onClick={() => setOpenBooking(b)}>
                    {b.title}{attachIds.has(b.id) ? ' 📎' : ''}
                  </button>
                  <span className="t-cat muted">{b.category || ''}</span>
                  <span className="t-cost num">{b.amount != null ? fmt(toBase(b.amount, b.currency, base), base) : ''}</span>
                  <a className="t-map" href={mapsUrl(b)} target="_blank" rel="noreferrer">Map</a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {openBooking &&
        <BookingDrawer booking={openBooking} onClose={() => setOpenBooking(null)} onSaved={load} />}
    </div>
  )
}

function mapsUrl(b) {
  let q = b.title || ''
  const m = (b.notes || '').match(/📍\s*(.+)\s*$/)
  if (m) q = m[1]
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)
}
