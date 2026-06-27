import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { coerceStays, searchStays } from './stays'

describe('coerceStays', () => {
  it('keeps named stays (with live price or just a band) and drops nameless ones', () => {
    const out = coerceStays([
      { id: 'a', name: 'Hotel A', price: '320', currency: 'AUD', rating: 4, per_night: '107' },
      { name: 'Hotel B', price_level: '$$' },   // Google fallback — no live number, kept
      { price: 100 },                            // no name -> dropped
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ name: 'Hotel A', price: 320, currency: 'AUD', per_night: 107 })
    expect(out[1]).toMatchObject({ name: 'Hotel B', price: null, price_level: '$$' })
  })
})

describe('searchStays', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('returns coerced results + source on success', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { source: 'duffel_stays', fetched_at: 't', nights: 3, results: [{ name: 'H', price: 200, currency: 'AUD' }] },
      error: null,
    })
    const r = await searchStays({ place: 'Paris', check_in: '2026-08-28', check_out: '2026-08-31', adults: 2 })
    expect(r.source).toBe('duffel_stays')
    expect(r.nights).toBe(3)
    expect(r.results[0].price).toBe(200)
  })

  it('degrades gracefully on a function error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'quota' } })
    const r = await searchStays({ place: 'X', check_in: 'a', check_out: 'b' })
    expect(r.results).toEqual([])
    expect(r.error).toEqual({ message: 'quota' })
  })
})
