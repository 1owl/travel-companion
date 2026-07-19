import { defineTool } from '../_define'
import { cancelBookingInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// Irreversible: cancels a Duffel order where the fare permits. Gated by the
// always-on approval requirement; the runtime shows refund amount/status first.
export default defineTool({
  name: 'cancel_booking',
  description: 'Cancel a booking where the fare permits. Irreversible; the approval gate shows the refund amount and status first. Never auto-runs.',
  inputSchema: cancelBookingInput,
  annotations: { financialHint: true, destructiveHint: true },
  async run(input) {
    const { data, error } = await supabase.functions.invoke('cancel-booking', { body: { booking_id: input.booking_id, reason: input.reason || null } })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Cancellation failed.', 'Retry; if the fare is non-cancellable this will keep failing.')
    if (data?.error) return err(data.code === 'not_supported' ? 'NOT_SUPPORTED' : 'UPSTREAM_ERROR', data.error, data.recovery_hint || 'This fare may not be cancellable.')
    return ok({ booking_id: input.booking_id, refund_amount: data.refund_amount ?? null, refund_currency: data.refund_currency ?? null, status: data.status })
  },
})
