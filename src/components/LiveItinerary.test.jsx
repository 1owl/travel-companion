import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LiveItinerary from './LiveItinerary'

vi.mock('../lib/supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock()
  return { supabase, hasSupabaseConfig: true, __store: store }
})

import { __store } from '../lib/supabase'

const seed = () => {
  __store.bookings = [
    { id: 'b1', trip_id: 't1', title: 'London hotel', category: 'Hotel', date: '29–30 Aug', status: 'BOOKED', amount: 400, currency: 'AUD', notes: '', created_at: '2026-01-01' },
    { id: 'b2', trip_id: 't1', title: 'Eurostar', category: 'Train', date: '31 Aug', status: 'TO BOOK', amount: 165, currency: 'AUD', notes: '', created_at: '2026-01-02' },
    { id: 'b3', trip_id: 't1', title: 'Mystery tour', category: 'Tour', date: 'TBC', status: 'OPTIONAL', amount: null, currency: 'AUD', notes: '', created_at: '2026-01-03' },
  ]
  __store.budget_items = [{ id: 'g1', trip_id: 't1', qty: 1, unit_price: 400, currency: 'AUD' }]
  __store.attachments = [{ id: 'a1', trip_id: 't1', booking_id: 'b1' }]
}

beforeEach(() => { localStorage.clear(); seed() })

const renderItin = () => render(<LiveItinerary tripId="t1" base="AUD" startISO="2026-08-28" travelers={2} />)

describe('LiveItinerary', () => {
  it('groups bookings by day with an Unscheduled bucket', async () => {
    renderItin()
    expect(await screen.findByText(/London hotel/)).toBeInTheDocument()
    expect(screen.getByText('Unscheduled')).toBeInTheDocument()
    expect(screen.getByText('Mystery tour')).toBeInTheDocument()
  })

  it('shows booked/to-book counts and the budget snapshot', async () => {
    renderItin()
    await screen.findByText(/London hotel/)
    // $400 shows in both the budget snapshot and the London line — at least one
    expect(screen.getAllByText('$400').length).toBeGreaterThan(0)
    // a booking with an attachment is flagged
    expect(screen.getByText(/London hotel 📎/)).toBeInTheDocument()
  })

  it('filters by status', async () => {
    renderItin()
    await screen.findByText(/London hotel/)
    const statusSel = screen.getByLabelText('Status')
    fireEvent.change(statusSel, { target: { value: 'BOOKED' } })
    await waitFor(() => expect(screen.queryByText('Eurostar')).not.toBeInTheDocument())
    expect(screen.getByText(/London hotel/)).toBeInTheDocument()
  })

  it('renders cached data with a banner when the server is unreachable', async () => {
    // Prime the cache, then make the bookings query fail.
    const { saveItinerary } = await import('../lib/itineraryCache.js')
    saveItinerary('t2', { at: '2026-06-21', bookings: [{ id: 'c1', title: 'Cached booking', status: 'BOOKED', category: 'Hotel', amount: 100, currency: 'AUD', date: '1 Sep', notes: '' }], budgetTotal: 100, attachBookingIds: [] })
    const { supabase } = await import('../lib/supabase')
    const orig = supabase.from
    supabase.from = (t) => t === 'bookings'
      ? { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'offline' } }) }) }) }
      : orig(t)

    render(<LiveItinerary tripId="t2" base="AUD" startISO="2026-08-28" travelers={2} />)
    expect(await screen.findByText('Cached booking')).toBeInTheDocument()
    expect(screen.getByText(/showing cached itinerary/i)).toBeInTheDocument()
    supabase.from = orig
  })
})
