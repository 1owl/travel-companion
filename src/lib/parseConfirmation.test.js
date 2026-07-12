import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { parseConfirmation, coerce, coerceList, emptyPrefill } from './parseConfirmation'

describe('coerce — one booking into the strict shape', () => {
  it('returns an empty prefill for non-JSON strings', () => {
    expect(coerce('this is not json {')).toEqual(emptyPrefill())
  })
  it('parses a JSON string into the strict shape', () => {
    const out = coerce('{"title":"Hotel Paris","amount":120}')
    expect(out.title).toBe('Hotel Paris')
    expect(out.amount).toBe('120')      // numbers coerced to strings
    expect(out.currency).toBe('AUD')    // missing -> default
  })
  it('keeps known fields and blanks unknown/non-scalar ones', () => {
    const out = coerce({ title: 'X', vendor: null, amount: 50, currency: 'EUR', confirmation_no: 'ABC', link: 'https://x.io/b', junk: { a: 1 } })
    expect(out).toEqual({
      title: 'X', vendor: '', category: '', date: '', start: '', end: '',
      location: '', amount: '50', currency: 'EUR', confirmation_no: 'ABC', link: 'https://x.io/b',
    })
  })
  it('returns empty for null / numbers / arrays', () => {
    expect(coerce(null)).toEqual(emptyPrefill())
    expect(coerce(42)).toEqual(emptyPrefill())
    expect(coerce([1, 2])).toEqual(emptyPrefill())
  })
})

describe('coerceList — a whole confirmation into many bookings', () => {
  it('unwraps { bookings: [...] } and drops signal-less entries', () => {
    const list = coerceList({ bookings: [
      { title: 'Flight out', vendor: 'Qantas' },
      { title: '', vendor: '', amount: '' }, // no signal -> dropped
      { confirmation_no: 'ABC123' },
    ] })
    expect(list).toHaveLength(2)
    expect(list[0].title).toBe('Flight out')
    expect(list[1].confirmation_no).toBe('ABC123')
  })
  it('accepts a JSON string of the wrapper', () => {
    const list = coerceList('{"bookings":[{"title":"Hotel","amount":90}]}')
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe('90')
  })
  it('wraps a bare single object', () => {
    expect(coerceList({ title: 'Solo' })).toHaveLength(1)
  })
  it('returns [] for junk', () => {
    expect(coerceList('not json')).toEqual([])
    expect(coerceList(null)).toEqual([])
  })
})

describe('parseConfirmation — graceful degradation', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('does not call the function for empty text and returns no bookings', async () => {
    const { bookings, error } = await parseConfirmation('   ')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(bookings).toEqual([])
    expect(error).toBeTruthy()
  })

  it('returns [] when the model returns garbage', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: 'garbage{', error: null })
    const { bookings, error } = await parseConfirmation('some confirmation text')
    expect(bookings).toEqual([])
    expect(error).toBeNull()
  })

  it('returns coerced bookings on a good response', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { bookings: [{ title: 'Eurostar', amount: 165, currency: 'AUD', link: 'https://eurostar.com/x' }] },
      error: null,
    })
    const { bookings } = await parseConfirmation('text')
    expect(bookings).toHaveLength(1)
    expect(bookings[0].title).toBe('Eurostar')
    expect(bookings[0].amount).toBe('165')
    expect(bookings[0].link).toBe('https://eurostar.com/x')
  })

  it('returns [] + error when the function errors', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { bookings, error } = await parseConfirmation('text')
    expect(bookings).toEqual([])
    expect(error).toEqual({ message: 'boom' })
  })

  it('sends page images for vision OCR and coerces the result', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { bookings: [{ title: 'Eurostar', amount: 118 }] }, error: null })
    const imgs = ['data:image/jpeg;base64,AAAA']
    const { bookings } = await parseConfirmation({ images: imgs })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-confirmation', { body: { images: imgs } })
    expect(bookings[0].title).toBe('Eurostar')
    expect(bookings[0].amount).toBe('118')
  })

  it('does not call the function when neither text nor images are given', async () => {
    const { bookings, error } = await parseConfirmation({})
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(bookings).toEqual([])
    expect(error).toBeTruthy()
  })
})
