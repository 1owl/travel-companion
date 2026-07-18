import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// vi.mock is hoisted above module scope, so the mock fns must be hoisted too.
const { invoke, insert, from } = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null })
  return { invoke: vi.fn(), insert, from: vi.fn(() => ({ insert })) }
})
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke }, from } }))

import HowToGetThere from './HowToGetThere'

const TRIP = { base_currency: 'AUD', name: 'Paris 2026', start_date: '2026-08-31', travelers: 2 }

function mockOptions() {
  invoke.mockResolvedValue({
    data: {
      distance_km: 1000, test: true, origin: 'London', destination: 'Paris',
      options: [
        { mode: 'flight', price: 200, currency: 'AUD', duration_min: 80, source: 'duffel', deep_link: 'https://f', route: 'LHR → CDG', test: true, offers: [{ id: 'a', airline: 'Qantas', price: 200, currency: 'AUD', stops: 0, duration: 'PT1H20M' }, { id: 'b', airline: 'BA', price: 240, currency: 'AUD', stops: 1, duration: 'PT3H' }] },
        { mode: 'train', price: null, currency: null, duration_min: 150, source: 'google_routes', deep_link: 'https://t' },
      ],
    },
    error: null,
  })
}

async function runSearch() {
  render(<HowToGetThere tripId="t1" trip={TRIP} />)
  fireEvent.change(screen.getByPlaceholderText('From (city or place)'), { target: { value: 'London' } })
  fireEvent.click(screen.getByRole('button', { name: /how to get there/i }))
  await screen.findByText('Flight')
}

describe('HowToGetThere', () => {
  beforeEach(() => { invoke.mockReset(); insert.mockClear(); from.mockClear() })

  it('renders a card per mode with tags, and the TEST banner for Duffel fares', async () => {
    mockOptions()
    await runSearch()
    expect(screen.getByText('Flight')).toBeInTheDocument()
    expect(screen.getByText('Train')).toBeInTheDocument()
    expect(screen.getByText(/TEST DATA/)).toBeInTheDocument()
    // flight is fastest; train (no price) is greenest; flight is the only priced → best value
    expect(screen.getByText('Fastest')).toBeInTheDocument()
    expect(screen.getByText('Greenest')).toBeInTheDocument()
    expect(screen.getByText('Best value')).toBeInTheDocument()
  })

  it('adds a leg to the booking ledger with the right shape', async () => {
    mockOptions()
    await runSearch()
    const addButtons = screen.getAllByRole('button', { name: /add to trip/i })
    fireEvent.click(addButtons[1]) // the train card
    await waitFor(() => expect(from).toHaveBeenCalledWith('bookings'))
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({
      trip_id: 't1', category: 'Train', status: 'TO BOOK',
      title: 'Train — London → Paris', amount: null, currency: 'AUD', link: 'https://t',
    })
    expect(row.notes).toContain('CO₂')
  })

  it('lets you enter a ground fare, which then reads back on the card', async () => {
    mockOptions()
    await runSearch()
    fireEvent.click(screen.getByRole('button', { name: /add price/i })) // train has no price
    fireEvent.change(screen.getByPlaceholderText('fare'), { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/95/)).toBeInTheDocument())
  })

  it('shows an error and no cards when the search fails', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'nope' } })
    render(<HowToGetThere tripId="t1" trip={TRIP} />)
    fireEvent.change(screen.getByPlaceholderText('From (city or place)'), { target: { value: 'London' } })
    fireEvent.click(screen.getByRole('button', { name: /how to get there/i }))
    await screen.findByText('nope')
    expect(screen.queryByText('Flight')).not.toBeInTheDocument()
  })
})
