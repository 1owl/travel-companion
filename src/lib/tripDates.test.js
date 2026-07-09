import { describe, it, expect } from 'vitest'
import { parseTripDate, bookingDate, groupByDay, daysUntil } from './tripDates'

const START = '2026-08-28'

describe('parseTripDate', () => {
  it('reads a day range, taking the start day', () => {
    const d = parseTripDate('29–30 Aug', START)
    expect(d.getUTCMonth()).toBe(7) // Aug
    expect(d.getUTCDate()).toBe(29)
    expect(d.getUTCFullYear()).toBe(2026)
  })
  it('reads a cross-month range', () => {
    const d = parseTripDate('31 Aug–2 Sep', START)
    expect(d.getUTCMonth()).toBe(7)
    expect(d.getUTCDate()).toBe(31)
  })
  it('reads a single date and ignores trailing words', () => {
    expect(parseTripDate('12 Sep AM', START).getUTCDate()).toBe(12)
    expect(parseTripDate('3 Sep', START).getUTCMonth()).toBe(8)
  })
  it('returns null for unparseable text', () => {
    expect(parseTripDate('TBC', START)).toBeNull()
    expect(parseTripDate('', START)).toBeNull()
    expect(parseTripDate(null, START)).toBeNull()
  })
  it('rolls into the next year when month precedes the trip start', () => {
    const d = parseTripDate('5 Jan', '2026-12-20')
    expect(d.getUTCFullYear()).toBe(2027)
    expect(d.getUTCMonth()).toBe(0)
  })
  it('reads the ISO date the ledger date-input emits', () => {
    const d = parseTripDate('2026-08-31', START)
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(7) // Aug
    expect(d.getUTCDate()).toBe(31)
  })
  it('returns null for an out-of-range ISO month/day', () => {
    expect(parseTripDate('2026-13-01', START)).toBeNull()
    expect(parseTripDate('2026-08-00', START)).toBeNull()
  })
})

describe('bookingDate', () => {
  it('prefers a precise starts_at over the text date', () => {
    const d = bookingDate({ starts_at: '2026-08-30T09:00:00Z', date: '1 Sep' }, START)
    expect(d.getUTCDate()).toBe(30)
  })
  it('falls back to the text date', () => {
    expect(bookingDate({ date: '3 Sep' }, START).getUTCMonth()).toBe(8)
  })
})

describe('daysUntil', () => {
  it('counts whole days to departure', () => {
    expect(daysUntil('2026-08-28', new Date('2026-08-21T00:00:00Z'))).toBe(7)
  })
  it('is negative once underway', () => {
    expect(daysUntil('2026-08-28', new Date('2026-08-30T00:00:00Z'))).toBe(-2)
  })
})

describe('groupByDay', () => {
  const bookings = [
    { id: 'b1', title: 'London', date: '29–30 Aug', created_at: '1' },
    { id: 'b2', title: 'Eurostar', date: '31 Aug', created_at: '2' },
    { id: 'b3', title: 'Mystery', date: 'TBC', created_at: '3' },
  ]
  it('groups into ordered days with an Unscheduled bucket last', () => {
    const g = groupByDay(bookings, START)
    expect(g).toHaveLength(3)
    expect(g[0].items[0].title).toBe('London') // 29 Aug first
    expect(g[1].items[0].title).toBe('Eurostar') // 31 Aug next
    expect(g[2].key).toBe('unscheduled')
    expect(g[2].items[0].title).toBe('Mystery')
  })
  it('omits the Unscheduled bucket when everything has a date', () => {
    const g = groupByDay(bookings.slice(0, 2), START)
    expect(g.some(x => x.key === 'unscheduled')).toBe(false)
  })
  it('schedules a booking dated via the ISO date-input (not Unscheduled)', () => {
    const g = groupByDay([{ id: 'i1', title: 'Louvre', date: '2026-09-03', created_at: '1' }], START)
    expect(g).toHaveLength(1)
    expect(g[0].key).toBe('2026-09-03')
    expect(g[0].items[0].title).toBe('Louvre')
  })
})
