// The MCP tool table. The Zod SCHEMAS are imported from the app's single source
// of truth (src/agent/contracts) — one contract, another transport. Execution is
// server-side here (Supabase REST + Edge Functions with the caller's token);
// behaviour mirrors the in-app handlers. Financial tools are intentionally NOT
// exposed over MCP in v1 (browser-agent/remote spend isn't trusted yet).

import {
  searchFlightsInput, searchStaysInput, getOfferInput, listTripsInput, getItineraryInput,
  searchActivitiesInput, getTripBudgetInput, createTripInput, addItineraryItemInput,
  updateItineraryItemInput, setTravellerPreferencesInput,
} from '../../src/agent/contracts/schemas.js'
import { toBase } from '../../src/lib/currency.js'
import { restGet, restPost, restPatch, invokeFn } from './backend.js'

const enc = encodeURIComponent
const ok = data => ({ data })
const fail = (code, message) => ({ error: { code, message } })

export const TOOLS = [
  // ── read ───────────────────────────────────────────────────────────────────
  { name: 'search_flights', scope: 'read', schema: searchFlightsInput,
    description: 'Search bookable flight offers (Duffel, TEST-mode) between two places for given dates. Prices are indicative until re-validated with get_offer.',
    async exec(i, s) {
      const r = await invokeFn(s.token, 'search-flights', { origin: i.origin, destination: i.destination, depart_date: i.depart_date, return_date: i.return_date, adults: i.adults })
      if (!r.ok || r.data?.error) return fail('UPSTREAM_ERROR', r.data?.error || `HTTP ${r.status}`)
      let results = r.data.results || []
      if (typeof i.max_stops === 'number') results = results.filter(o => (o.stops ?? 0) <= i.max_stops)
      return ok({ results, test: !!r.data.test, count: results.length })
    } },

  { name: 'search_stays', scope: 'read', schema: searchStaysInput,
    description: 'Find accommodation in a location for a date range. Duffel Stays where available, otherwise a price band + Booking.com link.',
    async exec(i, s) {
      const r = await invokeFn(s.token, 'search-stays', { place: i.location, check_in: i.check_in, check_out: i.check_out, adults: i.guests })
      if (!r.ok || r.data?.error) return fail('UPSTREAM_ERROR', r.data?.error || `HTTP ${r.status}`)
      let results = r.data.results || []
      if (typeof i.max_price_per_night === 'number') results = results.filter(x => x.per_night == null || x.per_night <= i.max_price_per_night)
      return ok({ results, source: r.data.source, count: results.length })
    } },

  { name: 'get_offer', scope: 'read', schema: getOfferInput,
    description: 'Re-price and re-validate a Duffel offer before booking. Returns current total, currency, expiry and whether it changed.',
    async exec(i, s) {
      const r = await invokeFn(s.token, 'get-offer', { offer_id: i.offer_id })
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      if (r.data?.error) return fail(r.data.code === 'expired' ? 'OFFER_EXPIRED' : 'UPSTREAM_ERROR', r.data.error)
      return ok(r.data)
    } },

  { name: 'list_trips', scope: 'read', schema: listTripsInput,
    description: "List the caller's trips with dates and base currency. Status is derived: 'past' once the end date passed, else 'planning'.",
    async exec(i, s) {
      const r = await restGet(s.token, '/trips?select=id,name,start_date,end_date,base_currency,travelers&order=start_date.asc')
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      const today = new Date().toISOString().slice(0, 10)
      let trips = (r.data || []).map(t => ({ ...t, status: t.end_date && t.end_date < today ? 'past' : 'planning' }))
      if (i.status && i.status !== 'all') trips = trips.filter(t => i.status === 'booked' ? t.status !== 'past' : t.status === i.status)
      return ok({ trips, count: trips.length })
    } },

  { name: 'get_itinerary', scope: 'read', schema: getItineraryInput,
    description: 'Return the full day-by-day itinerary for a trip (the booking ledger), ordered by date.',
    async exec(i, s) {
      const r = await restGet(s.token, `/bookings?trip_id=eq.${enc(i.trip_id)}&select=id,title,category,date,starts_at,ends_at,status,amount,currency,link,notes&order=date.asc`)
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      return ok({ trip_id: i.trip_id, items: r.data || [], count: (r.data || []).length })
    } },

  { name: 'search_activities', scope: 'read', schema: searchActivitiesInput,
    description: 'Find real places to see/do/eat in a location, grounded in Google (rating + one-line why). Never invents prices or hours.',
    async exec(i, s) {
      const kind = i.category === 'all' ? 'things to see, do and eat' : `${i.category} options`
      const r = await invokeFn(s.token, 'planner', { message: `Suggest ${kind} in ${i.location}${i.date ? ` for ${i.date}` : ''}.`, history: [], context: '' })
      if (!r.ok || r.data?.error) return fail('UPSTREAM_ERROR', r.data?.error || `HTTP ${r.status}`)
      return ok({ activities: r.data.cards || [], count: (r.data.cards || []).length })
    } },

  { name: 'get_trip_budget', scope: 'read', schema: getTripBudgetInput,
    description: "Return a trip's planned vs. committed vs. remaining, in its base currency. planned = budget items; committed = BOOKED bookings.",
    async exec(i, s) {
      const [trip, items, bookings] = await Promise.all([
        restGet(s.token, `/trips?id=eq.${enc(i.trip_id)}&select=base_currency,travelers`),
        restGet(s.token, `/budget_items?trip_id=eq.${enc(i.trip_id)}&select=qty,unit_price,currency`),
        restGet(s.token, `/bookings?trip_id=eq.${enc(i.trip_id)}&select=amount,currency,status`),
      ])
      const t = trip.data?.[0]
      if (!t) return fail('NOT_FOUND', 'No such trip.')
      const base = t.base_currency || 'AUD'
      const planned = (items.data || []).reduce((a, x) => a + toBase((Number(x.qty) || 0) * (Number(x.unit_price) || 0), x.currency, base), 0)
      const committed = (bookings.data || []).filter(b => b.status === 'BOOKED').reduce((a, b) => a + toBase(Number(b.amount) || 0, b.currency, base), 0)
      const round = n => Math.round(n * 100) / 100
      return ok({ trip_id: i.trip_id, base_currency: base, travelers: t.travelers || 1, planned: round(planned), committed: round(committed), remaining: round(planned - committed) })
    } },

  // ── write (require the 'write' scope) ───────────────────────────────────────
  { name: 'create_trip', scope: 'write', schema: createTripInput,
    description: 'Create a new trip. Non-financial.',
    async exec(i, s) {
      const r = await restPost(s.token, '/trips', { name: i.name, start_date: i.start_date || null, end_date: i.end_date || null, base_currency: i.base_currency, travelers: i.travelers }, 'return=representation')
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      return ok({ trip: r.data?.[0] || null })
    } },

  { name: 'add_itinerary_item', scope: 'write', schema: addItineraryItemInput,
    description: 'Add a planned/booked item to a trip itinerary (records intent; does not spend).',
    async exec(i, s) {
      const { trip_id, ...f } = i
      const r = await restPost(s.token, '/bookings', {
        trip_id, title: f.title, category: f.category, date: f.date || null, starts_at: f.starts_at || null, ends_at: f.ends_at || null,
        amount: f.amount ?? null, currency: f.currency || null, link: f.link || null, status: f.status, notes: f.notes || null,
      }, 'return=representation')
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      return ok({ item: r.data?.[0] || null })
    } },

  { name: 'update_itinerary_item', scope: 'write', schema: updateItineraryItemInput,
    description: 'Change fields on an existing itinerary item (booking).',
    async exec(i, s) {
      const patch = Object.fromEntries(Object.entries(i.patch).filter(([, v]) => v !== undefined))
      if (!Object.keys(patch).length) return fail('VALIDATION_FAILED', 'No fields to update.')
      const r = await restPatch(s.token, `/bookings?id=eq.${enc(i.item_id)}`, patch)
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      if (!r.data?.length) return fail('NOT_FOUND', 'No such item (or not yours).')
      return ok({ item: r.data[0] })
    } },

  { name: 'set_traveller_preferences', scope: 'write', schema: setTravellerPreferencesInput,
    description: 'Record durable traveller preferences (cabin, diet, pace, budget style). Never passport/payment data.',
    async exec(i, s) {
      const r = await restPost(s.token, '/traveller_preferences', { trip_id: i.trip_id || null, preferences: i.preferences }, 'return=representation,resolution=merge-duplicates')
      if (!r.ok) return fail('UPSTREAM_ERROR', `HTTP ${r.status}`)
      return ok({ preferences: r.data?.[0]?.preferences ?? i.preferences })
    } },
]
