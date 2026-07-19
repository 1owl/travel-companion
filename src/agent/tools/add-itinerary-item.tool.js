import { defineTool } from '../_define'
import { addItineraryItemInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// An itinerary item is a bookings row (the ledger is the itinerary). This records
// an intention — it does NOT spend or book anything.
export default defineTool({
  name: 'add_itinerary_item',
  description: 'Add a planned or booked item to a trip itinerary (flight, stay, train, activity, note). Non-financial — records an intention, does not spend. Confirm at L1.',
  inputSchema: addItineraryItemInput,
  annotations: { destructiveHint: false },
  async run(input) {
    const { trip_id, ...fields } = input
    const { data, error } = await supabase.from('bookings').insert({
      trip_id,
      title: fields.title, category: fields.category,
      date: fields.date || null, starts_at: fields.starts_at || null, ends_at: fields.ends_at || null,
      amount: fields.amount ?? null, currency: fields.currency || null,
      link: fields.link || null, status: fields.status, notes: fields.notes || null,
    }).select('id,title,category,date,status,amount,currency,link').single()
    if (error) return err('UPSTREAM_ERROR', error.message, 'Check the trip_id with list_trips, then retry.')
    return ok({ item: data })
  },
})
