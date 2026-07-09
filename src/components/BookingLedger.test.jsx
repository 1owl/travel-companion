import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BookingLedger from './BookingLedger'

vi.mock('../lib/supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock()
  return { supabase, hasSupabaseConfig: true, __store: store }
})

vi.mock('../lib/attachments', () => ({
  removeAttachmentsForBooking: vi.fn(() => Promise.resolve()),
}))

import { __store } from '../lib/supabase'

const seed = () => {
  __store.bookings = [
    { id: 'k1', trip_id: 't1', title: 'Annecy AirBnB', category: 'AirBnB', date: '3–6 Sep', status: 'BOOKED', amount: 475, currency: 'AUD', paid: false, link: '', notes: '', created_at: '2026-01-01' },
    { id: 'k2', trip_id: 't1', title: 'Eurostar', category: 'Train', date: '31 Aug', status: 'TO BOOK', amount: 165, currency: 'AUD', paid: false, link: 'https://eurostar.com', notes: '', created_at: '2026-01-02' },
  ]
}

beforeEach(() => seed())

describe('BookingLedger', () => {
  it('renders seeded bookings and reports the tracked total', async () => {
    const onTotal = vi.fn()
    render(<BookingLedger tripId="t1" base="AUD" onTotal={onTotal} />)

    expect(await screen.findByText('Annecy AirBnB')).toBeInTheDocument()
    // Eurostar has a link -> rendered as an anchor
    const link = screen.getByRole('link', { name: 'Eurostar' })
    expect(link).toHaveAttribute('href', 'https://eurostar.com')

    // 475 + 165 = 640 tracked
    await waitFor(() => {
      const last = onTotal.mock.calls.at(-1)[0]
      expect(last).toBeCloseTo(640, 2)
    })
  })

  it('adds a booking row', async () => {
    render(<BookingLedger tripId="t1" base="AUD" onTotal={() => {}} />)
    await screen.findByText('Annecy AirBnB')

    fireEvent.change(screen.getByPlaceholderText('What to book'), { target: { value: 'Louvre timed entry' } })
    fireEvent.change(screen.getByPlaceholderText('Cost'), { target: { value: '40' } })
    fireEvent.click(screen.getByText('Add'))

    expect(await screen.findByText('Louvre timed entry')).toBeInTheDocument()
    expect(__store.bookings.some(r => r.title === 'Louvre timed entry')).toBe(true)
  })

  it('removes a booking only after the user confirms', async () => {
    const { container } = render(<BookingLedger tripId="t1" base="AUD" onTotal={() => {}} />)
    await screen.findByText('Annecy AirBnB')

    // Declined confirm → nothing is deleted
    vi.stubGlobal('confirm', () => false)
    fireEvent.click(container.querySelectorAll('.btn.danger')[0])
    await waitFor(() => expect(__store.bookings).toHaveLength(2))

    // Confirmed → the booking is deleted
    vi.stubGlobal('confirm', () => true)
    fireEvent.click(container.querySelectorAll('.btn.danger')[0])
    await waitFor(() => expect(__store.bookings).toHaveLength(1))
    vi.unstubAllGlobals()
  })

  it('updates the tracked total when a cost is edited', async () => {
    const onTotal = vi.fn()
    render(<BookingLedger tripId="t1" base="AUD" onTotal={onTotal} />)
    await screen.findByText('Annecy AirBnB')

    const costInputs = screen.getAllByRole('spinbutton')
    const eurostarCost = costInputs.find(i => i.value === '165')
    fireEvent.change(eurostarCost, { target: { value: '200' } })

    // 475 + 200 = 675
    await waitFor(() => {
      const last = onTotal.mock.calls.at(-1)[0]
      expect(last).toBeCloseTo(675, 2)
    })
  })
})
