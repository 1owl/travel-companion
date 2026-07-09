import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BudgetEngine from './BudgetEngine'

vi.mock('../lib/supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock()
  return { supabase, hasSupabaseConfig: true, __store: store }
})

import { __store } from '../lib/supabase'

const seed = () => {
  __store.__failMutations = false
  __store.budget_items = [
    { id: 'b1', trip_id: 't1', category: 'Accommodation', item: 'London hotel', qty: 1, unit_price: 400, currency: 'AUD', created_at: '2026-01-01' },
    { id: 'b2', trip_id: 't1', category: 'Inter-city', item: 'Eurostar', qty: 2, unit_price: 44, currency: 'GBP', created_at: '2026-01-02' },
    { id: 'b3', trip_id: 't1', category: 'Inter-city', item: 'TGV', qty: 2, unit_price: 39, currency: 'EUR', created_at: '2026-01-03' },
  ]
}

beforeEach(() => seed())

describe('BudgetEngine', () => {
  it('renders seeded lines with FX-converted totals and per-person split', async () => {
    const onTotal = vi.fn()
    render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={onTotal} />)

    // Rows load from the mock
    expect(await screen.findByDisplayValue('London hotel')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Eurostar')).toBeInTheDocument()

    // 400 + (2×44×1.88=165.44) + (2×39×1.63=127.14) = 692.58 → "$693"
    expect(screen.getByText('$693')).toBeInTheDocument()
    // per person 346.29 → "$346"
    expect(screen.getByText('$346')).toBeInTheDocument()

    // onTotal reports the precise (unrounded) base total
    await waitFor(() => {
      const last = onTotal.mock.calls.at(-1)[0]
      expect(last).toBeCloseTo(692.58, 2)
    })
  })

  it('groups subtotals by category', async () => {
    render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={() => {}} />)
    await screen.findByDisplayValue('London hotel')
    // "By category" section lists Accommodation and Inter-city
    expect(screen.getByText('Accommodation')).toBeInTheDocument()
    expect(screen.getByText('Inter-city')).toBeInTheDocument()
  })

  it('adds a new budget line', async () => {
    const onTotal = vi.fn()
    render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={onTotal} />)
    await screen.findByDisplayValue('London hotel')

    fireEvent.change(screen.getByPlaceholderText('Item'), { target: { value: 'Contingency' } })
    fireEvent.change(screen.getByPlaceholderText('Unit price'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Add line'))

    expect(await screen.findByDisplayValue('Contingency')).toBeInTheDocument()
    expect(__store.budget_items.some(r => r.item === 'Contingency')).toBe(true)
  })

  it('surfaces an error instead of failing silently when a save fails', async () => {
    render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={() => {}} />)
    await screen.findByDisplayValue('London hotel')

    __store.__failMutations = true
    fireEvent.change(screen.getByPlaceholderText('Item'), { target: { value: 'Contingency' } })
    fireEvent.click(screen.getByText('Add line'))

    expect(await screen.findByText('mutation failed')).toBeInTheDocument()
  })

  it('removes a budget line only after the user confirms', async () => {
    const { container } = render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={() => {}} />)
    await screen.findByDisplayValue('London hotel')

    // Declined confirm → nothing is deleted
    vi.stubGlobal('confirm', () => false)
    fireEvent.click(container.querySelector('.btn.danger'))
    await waitFor(() => expect(__store.budget_items).toHaveLength(3))

    // Confirmed → the line is deleted
    vi.stubGlobal('confirm', () => true)
    fireEvent.click(container.querySelector('.btn.danger'))
    await waitFor(() => expect(__store.budget_items).toHaveLength(2))
    vi.unstubAllGlobals()
  })

  it('recomputes the base total when a unit price is edited', async () => {
    const onTotal = vi.fn()
    render(<BudgetEngine tripId="t1" base="AUD" travelers={2} onTotal={onTotal} />)
    await screen.findByDisplayValue('London hotel')

    // Change the London hotel (AUD) unit price 400 -> 500 (total +100 = 792.58)
    const priceInputs = screen.getAllByRole('spinbutton')
    const londonPrice = priceInputs.find(i => i.value === '400')
    fireEvent.change(londonPrice, { target: { value: '500' } })

    await waitFor(() => {
      const last = onTotal.mock.calls.at(-1)[0]
      expect(last).toBeCloseTo(792.58, 2)
    })
  })
})
