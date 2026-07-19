import { defineTool } from '../_define'
import { createBookingInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'
import getOffer from './get-offer.tool'

// The ONLY tool that spends money. In v1 it creates Duffel TEST orders only — no
// real card is charged (see spec Q2). Guarded by the always-on approval gate in
// defineTool; here we ALSO re-validate the offer and abort on any price move, so
// an agent can never book a stale fare.
export default defineTool({
  name: 'create_booking',
  description: 'Create a Duffel order for a validated offer — the only tool that spends money. Re-validates the offer first and ABORTS if the price or availability moved. Always pauses for an ApprovalGate showing the exact amount and refund status; non-refundable fares need a second confirmation. v1 creates TEST orders only — no real charge.',
  inputSchema: createBookingInput,
  annotations: { financialHint: true, destructiveHint: true, minAutonomyToAutoRun: null },
  async run(input, ctx) {
    // 1) Re-price immediately before writing — never trust the agent's number.
    const priced = await getOffer.execute({ offer_id: input.offer_id }, ctx)
    if (!priced.ok) return priced // OFFER_EXPIRED / AVAILABILITY_LOST / UPSTREAM_ERROR propagate
    const { total_amount, total_currency, refundable } = priced.data
    if (total_currency !== input.expected_currency || Number(total_amount) !== Number(input.expected_amount)) {
      return err('PRICE_MOVED',
        `Price is now ${total_amount} ${total_currency}, not the approved ${input.expected_amount} ${input.expected_currency}.`,
        'Show the new price in an ApprovalGate and get fresh approval before re-calling.')
    }
    // 2) Non-refundable fares require a SECOND explicit confirmation.
    if (refundable === false && !ctx?.approval?.nonRefundableConfirmed) {
      return err('APPROVAL_REQUIRED',
        `This fare is NON-REFUNDABLE at ${total_amount} ${total_currency}.`,
        'Confirm the non-refundable purchase explicitly (ctx.approval.nonRefundableConfirmed = true), then re-call.')
    }
    // 3) Create the (test) order server-side; the Edge Function re-validates too.
    const { data, error } = await supabase.functions.invoke('create-booking', {
      body: { offer_id: input.offer_id, trip_id: input.trip_id, passengers: input.passengers, expected_amount: input.expected_amount, expected_currency: input.expected_currency },
    })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Booking failed.', 'The offer may have just expired; re-price with get_offer.')
    if (data?.error) return err(data.code || 'UPSTREAM_ERROR', data.error, data.recovery_hint || 'Re-price and try again.')
    return ok({ booking_id: data.booking_id, order_id: data.order_id, amount: data.amount, currency: data.currency, test: !!data.test })
  },
})
