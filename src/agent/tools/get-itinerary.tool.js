import { defineTool } from '../_define'
import { getItineraryInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// The itinerary IS the booking ledger — there is no separate itinerary_items
// table. Items are ordered by date/start so the agent sees the trip in sequence.
export default defineTool({
  name: 'get_itinerary',
  description: "Return the full day-by-day itinerary for a trip: every booking and planned item with date, time, status, cost and link. Use before suggesting additions so you build around what already exists (and don't duplicate it).",
  inputSchema: getItineraryInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id,title,category,date,starts_at,ends_at,status,amount,currency,link,notes')
      .eq('trip_id', input.trip_id)
      .order('date', { ascending: true, nullsFirst: false })
    if (error) return err('UPSTREAM_ERROR', error.message, 'Retry, or check the trip_id with list_trips.')
    return ok({ trip_id: input.trip_id, items: data || [], count: (data || []).length })
  },
})
