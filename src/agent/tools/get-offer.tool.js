import { defineTool } from '../_define'
import { getOfferInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

export default defineTool({
  name: 'get_offer',
  description: 'Re-price and re-validate a specific Duffel offer by id, immediately before booking. Returns the current total, currency, expiry and whether price/availability changed since search. ALWAYS call this right before create_booking; never book from a stale search result. Cost: one Duffel lookup.',
  inputSchema: getOfferInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const { data, error } = await supabase.functions.invoke('get-offer', { body: { offer_id: input.offer_id } })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Could not re-price the offer.', 'Search again to obtain a fresh offer id.')
    if (data?.error) {
      const code = data.code === 'expired' ? 'OFFER_EXPIRED' : data.code === 'unavailable' ? 'AVAILABILITY_LOST' : 'UPSTREAM_ERROR'
      return err(code, data.error, 'Run search_flights/search_stays again for a current offer.')
    }
    return ok({
      offer_id: input.offer_id,
      total_amount: data.total_amount, total_currency: data.total_currency,
      expires_at: data.expires_at, changed: !!data.changed, refundable: data.refundable ?? null,
    })
  },
})
