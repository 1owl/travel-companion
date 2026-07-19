import { defineTool } from '../_define'
import { holdOfferInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// Financial-adjacent: places a temporary price hold (no charge) where the fare
// supports it. Gated by the always-on approval requirement in defineTool.
export default defineTool({
  name: 'hold_offer',
  description: 'Place a temporary hold on a Duffel offer to lock its price without paying, where the fare supports it. Returns the hold expiry. Requires explicit approval. Not a purchase, but treated as financial-adjacent. TEST mode only.',
  inputSchema: holdOfferInput,
  annotations: { financialHint: true, destructiveHint: false },
  async run(input) {
    const { data, error } = await supabase.functions.invoke('hold-offer', { body: { offer_id: input.offer_id, trip_id: input.trip_id } })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Could not hold the offer.', 'Re-price with get_offer and try again.')
    if (data?.error) return err(data.code === 'not_supported' ? 'NOT_SUPPORTED' : 'UPSTREAM_ERROR', data.error, 'This fare may not support holds; book directly instead.')
    return ok({ hold_id: data.hold_id, expires_at: data.expires_at, test: !!data.test })
  },
})
