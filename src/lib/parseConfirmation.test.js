import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

import { supabase } from './supabase'
import { parseConfirmation, coerce, emptyPrefill } from './parseConfirmation'

describe('coerce — tolerates malformed model output', () => {
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
    const out = coerce({ title: 'X', vendor: null, amount: 50, currency: 'EUR', confirmation_no: 'ABC', junk: { a: 1 } })
    expect(out).toEqual({ title: 'X', vendor: '', date: '', amount: '50', currency: 'EUR', confirmation_no: 'ABC' })
  })
  it('returns empty for null / numbers / arrays', () => {
    expect(coerce(null)).toEqual(emptyPrefill())
    expect(coerce(42)).toEqual(emptyPrefill())
    expect(coerce([1, 2])).toEqual({ ...emptyPrefill() })
  })
})

describe('parseConfirmation — graceful degradation', () => {
  beforeEach(() => supabase.functions.invoke.mockReset())

  it('does not call the function for empty text and returns empty prefill', async () => {
    const { data, error } = await parseConfirmation('   ')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(data).toEqual(emptyPrefill())
    expect(error).toBeTruthy()
  })

  it('falls back to empty prefill when the model returns garbage', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: 'garbage{', error: null })
    const { data, error } = await parseConfirmation('some confirmation text')
    expect(data).toEqual(emptyPrefill())
    expect(error).toBeNull()
  })

  it('returns coerced fields on a good response', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { title: 'Eurostar', amount: 165, currency: 'AUD' }, error: null })
    const { data } = await parseConfirmation('text')
    expect(data.title).toBe('Eurostar')
    expect(data.amount).toBe('165')
  })

  it('returns empty prefill + error when the function errors', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const { data, error } = await parseConfirmation('text')
    expect(data).toEqual(emptyPrefill())
    expect(error).toEqual({ message: 'boom' })
  })
})
