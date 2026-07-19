import { defineTool } from '../_define'
import { setTravellerPreferencesInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// Durable preferences, stored in traveller_preferences (per-user, optional
// per-trip). Never store passport/payment data here — the schema forbids it.
export default defineTool({
  name: 'set_traveller_preferences',
  description: 'Record durable traveller preferences (cabin, max stops, diet, pace, budget style) to personalise suggestions. Non-financial. Never accepts passport or payment data.',
  inputSchema: setTravellerPreferencesInput,
  annotations: { destructiveHint: false },
  async run(input) {
    const row = { trip_id: input.trip_id || null, preferences: input.preferences }
    // Upsert on (user_id, trip_id) — user_id defaults to auth.uid() server-side.
    const { data, error } = await supabase.from('traveller_preferences')
      .upsert(row, { onConflict: 'user_id,trip_id' })
      .select('trip_id,preferences').single()
    if (error) return err('UPSTREAM_ERROR', error.message, 'Retry; ensure the traveller_preferences table exists.')
    return ok({ preferences: data?.preferences, trip_id: data?.trip_id ?? null })
  },
})
