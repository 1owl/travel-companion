// Turn a booking's loose date info into a real calendar day so the itinerary can
// group and sort. Bookings carry either a precise `starts_at` (timestamptz) or a
// free-text `date` like "29–30 Aug", "31 Aug–2 Sep", "3 Sep", "12 Sep AM", "TBC".
// Anything we can't read returns null → the "Unscheduled" bucket.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

// Parse free text → Date (UTC noon to dodge timezone day-shifts). `startISO` is
// the trip start, used to pick the year (and roll into next year if the month is
// before the start month, e.g. a Dec→Jan trip).
export function parseTripDate(text, startISO) {
  if (!text) return null
  const s = String(text).trim()

  // The ledger's `<input type="date">` emits an ISO "YYYY-MM-DD" string, which the
  // free-text parser below can't read (it grabs "20" from "2026" as the day and
  // finds no month). Handle the ISO shape explicitly so ledger-dated bookings land
  // on the itinerary instead of falling into "Unscheduled".
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const mon = parseInt(iso[2], 10) - 1
    const day = parseInt(iso[3], 10)
    if (mon < 0 || mon > 11 || !day || day > 31) return null
    return new Date(Date.UTC(y, mon, day, 12))
  }

  const dayM = s.match(/\d{1,2}/)
  const monM = s.match(/[A-Za-z]{3,}/)
  if (!dayM || !monM) return null
  const day = parseInt(dayM[0], 10)
  const mon = MONTHS[monM[0].slice(0, 3).toLowerCase()]
  if (mon == null || !day || day > 31) return null

  const start = startISO ? new Date(startISO) : null
  let year = start && !isNaN(start) ? start.getUTCFullYear() : new Date().getUTCFullYear()
  if (start && !isNaN(start) && mon < start.getUTCMonth()) year += 1
  return new Date(Date.UTC(year, mon, day, 12))
}

// Resolve a booking to its day: precise starts_at wins, else parse the text date.
export function bookingDate(booking, startISO) {
  if (booking?.starts_at) {
    const d = new Date(booking.starts_at)
    if (!isNaN(d)) return d
  }
  return parseTripDate(booking?.date, startISO)
}

export function dayKey(date) {
  return date.toISOString().slice(0, 10) // yyyy-mm-dd
}

export function formatDayHeading(date) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(date)
}

// "HH:mm" only when the booking had a real timestamp (not a parsed text date).
export function formatTime(booking) {
  if (!booking?.starts_at) return ''
  const d = new Date(booking.starts_at)
  if (isNaN(d)) return ''
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit' }).format(d)
}

// Whole days from `now` until the trip start (negative once underway/past).
export function daysUntil(startISO, now = new Date()) {
  if (!startISO) return null
  const start = new Date(startISO)
  if (isNaN(start)) return null
  const ms = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
    - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round(ms / 86_400_000)
}

// Group bookings into ordered day buckets + a trailing "Unscheduled" bucket.
// Returns [{ key, date, heading, items }], days ascending, unscheduled last.
export function groupByDay(bookings, startISO) {
  const days = new Map()
  const unscheduled = []
  for (const b of bookings || []) {
    const d = bookingDate(b, startISO)
    if (!d || isNaN(d)) { unscheduled.push(b); continue }
    const k = dayKey(d)
    if (!days.has(k)) days.set(k, { key: k, date: d, heading: formatDayHeading(d), items: [] })
    days.get(k).items.push(b)
  }
  const ordered = [...days.values()].sort((a, b) => a.key < b.key ? -1 : 1)
  for (const g of ordered) {
    g.items.sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || '')
      || (a.created_at || '').localeCompare(b.created_at || ''))
  }
  if (unscheduled.length) ordered.push({ key: 'unscheduled', date: null, heading: 'Unscheduled', items: unscheduled })
  return ordered
}
