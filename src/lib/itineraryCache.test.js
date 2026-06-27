import { describe, it, expect, beforeEach } from 'vitest'
import { saveItinerary, loadItinerary } from './itineraryCache'

describe('itineraryCache', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a saved payload', () => {
    const payload = { at: '2026-06-21T00:00:00Z', bookings: [{ id: 'b1' }], budgetTotal: 8043, attachBookingIds: ['b1'] }
    saveItinerary('trip-1', payload)
    expect(loadItinerary('trip-1')).toEqual(payload)
  })

  it('returns null when nothing is cached', () => {
    expect(loadItinerary('missing')).toBeNull()
  })

  it('keeps caches separate per trip', () => {
    saveItinerary('a', { at: '1', bookings: [{ id: 'x' }], budgetTotal: 1, attachBookingIds: [] })
    saveItinerary('b', { at: '2', bookings: [{ id: 'y' }], budgetTotal: 2, attachBookingIds: [] })
    expect(loadItinerary('a').bookings[0].id).toBe('x')
    expect(loadItinerary('b').bookings[0].id).toBe('y')
  })
})
