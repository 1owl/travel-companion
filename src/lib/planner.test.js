import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { cardPrice, coerceCards, askPlanner } from './planner'

describe('cardPrice — never invents a price', () => {
  it('returns a price only when it is a recognised grounded value', () => {
    expect(cardPrice({ price_level: '$$' })).toBe('$$')
    expect(cardPrice({ price_level: 'Free' })).toBe('Free')
  })
  it('returns empty for anything not in the grounded set', () => {
    expect(cardPrice({ price_level: '€18 entry' })).toBe('')   // model can't sneak a price in
    expect(cardPrice({ price_level: null })).toBe('')
    expect(cardPrice({})).toBe('')
    expect(cardPrice(null)).toBe('')
  })
})

describe('coerceCards', () => {
  it('drops cards with no name and strips ungrounded prices', () => {
    const out = coerceCards([
      { name: 'Eiffel Tower', price_level: '$$$', rating: 4.6, user_ratings_total: 100, lat: 48.8, lng: 2.2 },
      { name: '', price_level: '$' },                 // no name -> dropped
      { name: 'Sketchy', price_level: '£20 per person' }, // invented price -> nulled
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ name: 'Eiffel Tower', price_level: '$$$', rating: 4.6 })
    expect(out[1].price_level).toBeNull()
    expect(cardPrice(out[1])).toBe('')
  })
  it('coerces non-numeric rating/coords to null', () => {
    const [c] = coerceCards([{ name: 'X', rating: 'great', lat: 'north' }])
    expect(c.rating).toBeNull()
    expect(c.lat).toBeNull()
  })
})

describe('askPlanner', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('returns the reply and grounded cards on success', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { reply: 'Here are some ideas', cards: [{ name: 'Louvre', price_level: '$$', rating: 4.7 }] },
      error: null,
    })
    const { reply, cards, error } = await askPlanner('things to see in Paris')
    expect(error).toBeNull()
    expect(reply).toBe('Here are some ideas')
    expect(cards[0].name).toBe('Louvre')
    expect(cardPrice(cards[0])).toBe('$$')
  })

  it('never surfaces an ungrounded price from the function', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { reply: 'ok', cards: [{ name: 'Bistro', price_level: '~€45 for two' }] },
      error: null,
    })
    const { cards } = await askPlanner('cheap eats')
    expect(cards[0].price_level).toBeNull()
    expect(cardPrice(cards[0])).toBe('')
  })

  it('degrades gracefully on a function error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'quota' } })
    const { cards, error } = await askPlanner('anything')
    expect(cards).toEqual([])
    expect(error).toEqual({ message: 'quota' })
  })

  it('forwards trip context to the function so suggestions are grounded in the itinerary', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { reply: 'ok', cards: [] }, error: null })
    await askPlanner('fill my free days', [], { context: 'Trip: France 2026\n- [BOOKED] Annecy AirBnB' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('planner', {
      body: { message: 'fill my free days', history: [], context: 'Trip: France 2026\n- [BOOKED] Annecy AirBnB' },
    })
  })
})
