import { describe, it, expect } from 'vitest'
import { bookingLink, ledgerCategory } from './bookingLinks'

describe('bookingLink — right provider, dates pre-filled', () => {
  it('accommodation → Booking.com with destination + check-in/out', () => {
    const u = bookingLink({ name: 'Mas du Rollier', category: 'accommodation' }, { start_date: '2026-09-07', end_date: '2026-09-11' })
    expect(u).toContain('booking.com/searchresults')
    expect(u).toContain('ss=Mas+du+Rollier')
    expect(u).toContain('checkin=2026-09-07')
    expect(u).toContain('checkout=2026-09-11')
  })
  it('activity → GetYourGuide search', () => {
    const u = bookingLink({ name: 'Lake Annecy cruise', category: 'activity' }, {})
    expect(u).toContain('getyourguide.com/s/')
    expect(u).toContain('q=Lake+Annecy+cruise')
  })
  it('sight → uses the place’s own maps link when present', () => {
    const u = bookingLink({ name: 'Eiffel Tower', category: 'sight', maps_url: 'https://maps.google.com/?cid=123' }, {})
    expect(u).toBe('https://maps.google.com/?cid=123')
  })
  it('sight without a maps link → Google Maps search', () => {
    const u = bookingLink({ name: 'Some Sight', category: 'sight' }, {})
    expect(u).toContain('google.com/maps/search')
    expect(u).toContain('query=Some+Sight')
  })
})

describe('ledgerCategory', () => {
  it('maps planner categories to ledger labels', () => {
    expect(ledgerCategory('accommodation')).toBe('Hotel')
    expect(ledgerCategory('activity')).toBe('Activity')
    expect(ledgerCategory('food')).toBe('Food')
    expect(ledgerCategory('sight')).toBe('Attraction')
    expect(ledgerCategory(undefined)).toBe('Attraction')
  })
})
