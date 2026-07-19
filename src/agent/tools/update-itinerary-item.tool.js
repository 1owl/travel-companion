import { defineTool } from '../_define'
import { updateItineraryItemInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

export default defineTool({
  name: 'update_itinerary_item',
  description: 'Change fields on an existing itinerary item (booking). Confirm at L1. Cannot move it to another trip or another user.',
  inputSchema: updateItineraryItemInput,
  annotations: { destructiveHint: false },
  async run(input) {
    const patch = Object.fromEntries(Object.entries(input.patch).filter(([, v]) => v !== undefined))
    if (!Object.keys(patch).length) return err('VALIDATION_FAILED', 'No fields to update.', 'Include at least one field in patch.')
    const { data, error } = await supabase.from('bookings')
      .update(patch).eq('id', input.item_id)
      .select('id,title,category,date,status,amount,currency,link').single()
    if (error) return err('UPSTREAM_ERROR', error.message, 'Check the item_id with get_itinerary.')
    if (!data) return err('NOT_FOUND', 'No itinerary item with that id (or not yours).', 'List items with get_itinerary.')
    return ok({ item: data })
  },
})
