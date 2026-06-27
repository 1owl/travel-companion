import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { durationMinutes, formatDuration, coerceOffers, rankOffers, searchFlights } from './flights'

describe('duration helpers', () => {
  it('parses ISO-8601 durations', () => {
    expect(durationMinutes('PT2H5M')).toBe(125)
    expect(durationMinutes('PT45M')).toBe(45)
    expect(durationMinutes('')).toBe(0)
  })
  it('formats duration', () => {
    expect(formatDuration('PT2H5M')).toBe('2h 05m')
  })
})

describe('coerceOffers', () => {
  it('keeps finite-priced offers and normalises fields', () => {
    const out = coerceOffers([
      { id: 'a', price: '120', currency: 'AUD', stops: 0 },
      { id: 'b', price: 'NaN' },           // dropped
      { id: 'c', price: 200, currency: 'AUD', stops: 1 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].price).toBe(120)
  })
})

describe('rankOffers — the cheapest↔comfort slider', () => {
  const offers = [
    { id: 'a', price: 100, stops: 1, duration: 'PT5H' }, // cheapest, least comfy
    { id: 'b', price: 200, stops: 0, duration: 'PT2H' }, // priciest, most comfy
    { id: 'c', price: 150, stops: 1, duration: 'PT4H' },
  ]
  it('weight 1 ranks by price (cheapest first)', () => {
    expect(rankOffers(offers, 1).map(o => o.id)).toEqual(['a', 'c', 'b'])
  })
  it('weight 0 ranks by comfort (fewest stops + shortest)', () => {
    expect(rankOffers(offers, 0)[0].id).toBe('b')
  })
  it('does not mutate the input', () => {
    const copy = [...offers]
    rankOffers(offers, 0.5)
    expect(offers).toEqual(copy)
  })
})

describe('searchFlights', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())
  it('returns coerced results + source on success', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { source: 'duffel', fetched_at: 't', results: [{ id: 'a', price: 99, currency: 'AUD' }] }, error: null })
    const { results, source, error } = await searchFlights({ origin: 'LON', destination: 'PAR', depart_date: '2026-08-31' })
    expect(error).toBeNull()
    expect(source).toBe('duffel')
    expect(results[0].price).toBe(99)
  })
  it('degrades gracefully on a function error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'quota' } })
    const { results, error } = await searchFlights({ origin: 'LON', destination: 'PAR', depart_date: '2026-08-31' })
    expect(results).toEqual([])
    expect(error).toEqual({ message: 'quota' })
  })
})
