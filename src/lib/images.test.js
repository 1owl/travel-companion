import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { destinationOf, coverQuery, searchImages, trackImageUse } from './images'

describe('destinationOf', () => {
  it('strips a trailing year', () => {
    expect(destinationOf('France 2026')).toBe('France')
    expect(destinationOf({ name: 'Italy 2027' })).toBe('Italy')
  })
  it('handles apostrophe-years and dashes', () => {
    expect(destinationOf("Tokyo Spring '27")).toBe('Tokyo Spring')
    expect(destinationOf('Paris —')).toBe('Paris')
  })
  it('keeps names without a year', () => {
    expect(destinationOf('Maldives')).toBe('Maldives')
    expect(destinationOf('')).toBe('')
  })
})

describe('coverQuery', () => {
  it('biases a destination toward travel imagery', () => {
    expect(coverQuery('France 2026')).toBe('France travel destination')
    expect(coverQuery({ name: 'Bali' })).toBe('Bali travel destination')
  })
  it('falls back to a generic travel query when empty', () => {
    expect(coverQuery('')).toBe('travel destination landscape')
  })
})

describe('searchImages', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('returns results on success', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { source: 'unsplash', results: [{ id: '1', url: 'http://img/1', author: 'A' }] }, error: null,
    })
    const { results, source } = await searchImages('Nice')
    expect(source).toBe('unsplash')
    expect(results[0].url).toBe('http://img/1')
  })

  it('degrades to an empty list on error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'no key' } })
    const { results } = await searchImages('Lyon')
    expect(results).toEqual([])
  })

  it('returns empty for a blank query without calling the function', async () => {
    const { results } = await searchImages('   ')
    expect(results).toEqual([])
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('caches a successful query for the page load', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { source: 'unsplash', results: [{ id: '9', url: 'http://img/9' }] }, error: null,
    })
    await searchImages('Cannes')
    await searchImages('Cannes')
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1)
  })
})

describe('trackImageUse', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())
  it('pings the function with the download location', () => {
    trackImageUse('http://api/download/1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('image-search', { body: { track: 'http://api/download/1' } })
  })
  it('does nothing without a location', () => {
    trackImageUse(null)
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })
})
