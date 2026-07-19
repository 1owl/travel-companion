import { defineTool } from '../_define'
import { searchStaysInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { searchStays } from '../../lib/stays'

export default defineTool({
  name: 'search_stays',
  description: 'Find accommodation in a location for a date range. Returns hotels with a nightly/total price when Duffel Stays is available, otherwise a price band plus a Booking.com link. Treat prices as indicative. Cost: one search.',
  inputSchema: searchStaysInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const { results, fetched_at, nights, source, test, error } = await searchStays({
      place: input.location, check_in: input.check_in, check_out: input.check_out, guests: input.guests, adults: input.guests,
    })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Stay search failed.', 'Retry, or widen the area/dates.')
    const filtered = typeof input.max_price_per_night === 'number'
      ? results.filter(s => s.per_night == null || s.per_night <= input.max_price_per_night)
      : results
    return ok({ results: filtered, source, nights, test: !!test, fetched_at, count: filtered.length })
  },
})
