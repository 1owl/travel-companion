import { defineTool } from '../_define'
import { createTripInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

export default defineTool({
  name: 'create_trip',
  description: 'Create a new trip. Non-financial — records intent, spends nothing. At L1 (Suggest) the user confirms before it is saved.',
  inputSchema: createTripInput,
  annotations: { destructiveHint: false },
  async run(input) {
    const { data, error } = await supabase.from('trips').insert({
      name: input.name, start_date: input.start_date || null, end_date: input.end_date || null,
      base_currency: input.base_currency, travelers: input.travelers,
    }).select('id,name,start_date,end_date,base_currency,travelers').single()
    if (error) return err('UPSTREAM_ERROR', error.message, 'Retry; if it persists check you are signed in.')
    return ok({ trip: data })
  },
})
