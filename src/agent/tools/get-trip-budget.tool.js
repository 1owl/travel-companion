import { defineTool } from '../_define'
import { getTripBudgetInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'
import { toBase } from '../../lib/currency'

// planned  = budget_items (qty × unit_price) in base currency
// committed = bookings marked BOOKED (or paid) in base currency
// remaining = planned − committed
export default defineTool({
  name: 'get_trip_budget',
  description: "Return a trip's budget as planned vs. committed vs. remaining, in its base currency. planned = budget line items; committed = bookings marked BOOKED. Use to check headroom before proposing spend.",
  inputSchema: getTripBudgetInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const [{ data: trip, error: te }, { data: items, error: ie }, { data: bookings, error: be }] = await Promise.all([
      supabase.from('trips').select('base_currency,travelers').eq('id', input.trip_id).single(),
      supabase.from('budget_items').select('qty,unit_price,currency').eq('trip_id', input.trip_id),
      supabase.from('bookings').select('amount,currency,status').eq('trip_id', input.trip_id),
    ])
    if (te || ie || be) return err('UPSTREAM_ERROR', (te || ie || be).message, 'Check the trip_id with list_trips.')
    if (!trip) return err('NOT_FOUND', 'No such trip.', 'Call list_trips to get a valid trip_id.')
    const base = trip.base_currency || 'AUD'
    const planned = (items || []).reduce((s, i) => s + toBase((Number(i.qty) || 0) * (Number(i.unit_price) || 0), i.currency, base), 0)
    const committed = (bookings || []).filter(b => b.status === 'BOOKED')
      .reduce((s, b) => s + toBase(Number(b.amount) || 0, b.currency, base), 0)
    const round = n => Math.round(n * 100) / 100
    return ok({
      trip_id: input.trip_id, base_currency: base, travelers: trip.travelers || 1,
      planned: round(planned), committed: round(committed), remaining: round(planned - committed),
    })
  },
})
