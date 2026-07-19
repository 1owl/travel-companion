import { defineTool } from '../_define'
import { searchFlightsInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { searchFlights } from '../../lib/flights'

export default defineTool({
  name: 'search_flights',
  description: 'Search bookable flight offers between two places for given dates. Use when the traveller wants to find or compare flights. Returns priced options from Duffel (TEST-mode fares — indicative, not bookable) each with an id and a fetched_at timestamp; prices must be re-validated with get_offer before booking. Cost: one rate-limited Duffel search.',
  inputSchema: searchFlightsInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const { results, test, fetched_at, error } = await searchFlights({
      origin: input.origin, destination: input.destination,
      depart_date: input.depart_date, return_date: input.return_date, adults: input.adults,
    })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Flight search failed.', 'Retry, or adjust dates/airports.')
    const filtered = typeof input.max_stops === 'number'
      ? results.filter(o => (o.stops ?? 0) <= input.max_stops)
      : results
    return ok({ results: filtered, test: !!test, fetched_at, count: filtered.length })
  },
})
