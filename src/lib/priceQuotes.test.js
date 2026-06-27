import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock({ price_quotes: [] })
  return { supabase, __store: store }
})

import { __store } from './supabase'
import { saveQuote, listQuotes, removeQuote } from './priceQuotes'

beforeEach(() => { __store.price_quotes = [] })

const offer = { source: 'duffel', origin: 'LON', destination: 'PAR', airline: 'British Airways', price: 142, currency: 'AUD', deep_link: 'https://g/flights', fetched_at: '2026-06-23T00:00:00Z' }
const query = { depart_date: '2026-08-31', return_date: '2026-09-02' }

describe('priceQuotes', () => {
  it('saves a quote with source, price and freshness', async () => {
    const { data, error } = await saveQuote({ id: 't1' }, offer, query)
    expect(error).toBeNull()
    expect(data).toMatchObject({ kind: 'flight', source: 'duffel', title: 'LON→PAR · British Airways', price: 142, currency: 'AUD', depart_date: '2026-08-31' })
    expect(data.fetched_at).toBe('2026-06-23T00:00:00Z')
    expect(__store.price_quotes).toHaveLength(1)
  })
  it('lists and removes quotes', async () => {
    const { data } = await saveQuote({ id: 't1' }, offer, query)
    const { data: list } = await listQuotes('t1')
    expect(list).toHaveLength(1)
    await removeQuote(data.id)
    expect(__store.price_quotes).toHaveLength(0)
  })
})
