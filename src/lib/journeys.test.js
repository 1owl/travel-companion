import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { searchJourneys, rankModes, durationLabel, modeLabel } from './journeys'

describe('searchJourneys — graceful degradation', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('does not call the function without an origin/destination', async () => {
    const { options, error } = await searchJourneys({ origin: '', destination: 'Paris' })
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(options).toEqual([])
    expect(error).toBeTruthy()
  })

  it('attaches CO₂ from the trip distance when the server omits it', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: {
        distance_km: 1000, test: false, fetched_at: 'now',
        options: [
          { mode: 'flight', price: 200, currency: 'AUD', duration_min: 120 },
          { mode: 'train', price: null, currency: null, duration_min: 300 },
        ],
      },
      error: null,
    })
    const { options, distance_km } = await searchJourneys({ origin: 'London', destination: 'Paris' })
    expect(distance_km).toBe(1000)
    // flight 1000×1.0×0.18 = 180, train 1000×1.2×0.035 = 42
    expect(options.find(o => o.mode === 'flight').co2_kg).toBe(180)
    expect(options.find(o => o.mode === 'train').co2_kg).toBe(42)
  })

  it('keeps a server-provided CO₂ value if present', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { distance_km: 1000, options: [{ mode: 'flight', co2_kg: 999 }] }, error: null,
    })
    const { options } = await searchJourneys({ origin: 'A', destination: 'B' })
    expect(options[0].co2_kg).toBe(999)
  })

  it('returns [] + error when the function errors', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { options, error } = await searchJourneys({ origin: 'A', destination: 'B' })
    expect(options).toEqual([])
    expect(error).toEqual({ message: 'boom' })
  })
})

describe('rankModes — Best value / Fastest / Greenest', () => {
  it('tags the cheapest (in base currency), fastest and greenest', () => {
    const out = rankModes([
      { mode: 'flight', price: 200, currency: 'AUD', duration_min: 120, co2_kg: 180 },
      { mode: 'train', price: 150, currency: 'AUD', duration_min: 300, co2_kg: 42 },
      { mode: 'bus', price: 90, currency: 'AUD', duration_min: 500, co2_kg: 32 },
    ], 'AUD')
    const tag = m => out.find(o => o.mode === m).tags
    expect(tag('bus')).toContain('Best value')     // cheapest
    expect(tag('bus')).toContain('Greenest')       // lowest CO₂
    expect(tag('flight')).toContain('Fastest')     // lowest duration
    expect(tag('train')).toEqual([])               // wins nothing
  })

  it('converts to base currency before picking Best value', () => {
    // 100 GBP > 150 AUD once converted (GBP is worth more), so AUD 150 is cheaper.
    const out = rankModes([
      { mode: 'flight', price: 100, currency: 'GBP' },
      { mode: 'train', price: 150, currency: 'AUD' },
    ], 'AUD')
    expect(out.find(o => o.mode === 'train').tags).toContain('Best value')
    expect(out.find(o => o.mode === 'flight').tags).not.toContain('Best value')
  })

  it('omits Best value entirely when no option has a price', () => {
    const out = rankModes([
      { mode: 'train', price: null, duration_min: 300, co2_kg: 42 },
      { mode: 'bus', price: null, duration_min: 500, co2_kg: 32 },
    ], 'AUD')
    expect(out.every(o => !o.tags.includes('Best value'))).toBe(true)
    expect(out.find(o => o.mode === 'bus').tags).toContain('Greenest')
  })

  it('lets an option hold several tags and handles ties', () => {
    const out = rankModes([
      { mode: 'train', price: 100, currency: 'AUD', duration_min: 200, co2_kg: 40 },
      { mode: 'bus', price: 100, currency: 'AUD', duration_min: 400, co2_kg: 40 },
    ], 'AUD')
    // tie on price and CO₂ → both get Best value + Greenest
    expect(out.find(o => o.mode === 'train').tags).toEqual(expect.arrayContaining(['Best value', 'Greenest', 'Fastest']))
    expect(out.find(o => o.mode === 'bus').tags).toEqual(expect.arrayContaining(['Best value', 'Greenest']))
  })
})

describe('helpers', () => {
  it('durationLabel formats minutes', () => {
    expect(durationLabel(125)).toBe('2h 5m')
    expect(durationLabel(45)).toBe('45m')
    expect(durationLabel(0)).toBeNull()
    expect(durationLabel(null)).toBeNull()
  })
  it('modeLabel titles known + unknown modes', () => {
    expect(modeLabel('flight')).toBe('Flight')
    expect(modeLabel('ferry')).toBe('Ferry')
    expect(modeLabel('hovercraft')).toBe('Hovercraft')
  })
})
