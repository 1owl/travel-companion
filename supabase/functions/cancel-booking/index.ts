// Supabase Edge Function: cancel-booking
// Cancels the Duffel order behind a booking (stored in bookings.confirmation_no)
// where the fare permits, and marks the ledger row cancelled. TEST-mode only.
// Two-step Duffel flow: create a cancellation (quotes the refund) → confirm it.
//
// Deploy:  supabase functions deploy cancel-booking
// Secret:  DUFFEL_API_KEY   Optional: DUFFEL_VERSION

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'cancel-booking', 6, 40, true); if (blocked) return blocked

  const key = Deno.env.get('DUFFEL_API_KEY')
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const auth = req.headers.get('Authorization') || ''
  if (!key) return json({ error: 'Cancellation not configured.', code: 'not_configured' }, 503)

  let bookingId = ''
  try { bookingId = String((await req.json())?.booking_id || '').trim() } catch { /* empty */ }
  if (!bookingId) return json({ error: 'booking_id is required.', code: 'validation' }, 400)

  try {
    // Look up the Duffel order id from the caller's own booking row (RLS applies).
    const look = await fetch(`${url}/rest/v1/bookings?id=eq.${bookingId}&select=confirmation_no`, {
      headers: { apikey: anon || '', Authorization: auth },
    })
    const rows = look.ok ? await look.json() : []
    const orderId = rows?.[0]?.confirmation_no
    if (!orderId) return json({ error: 'No cancellable Duffel order for that booking.', code: 'not_supported' }, 200)

    // 1) Create the cancellation (quotes the refund).
    const cRes = await fetch('https://api.duffel.com/air/order_cancellations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: { order_id: orderId } }),
    })
    if (!cRes.ok) return json({ error: 'This fare cannot be cancelled.', code: 'not_supported', detail: (await cRes.text()).slice(0, 160) }, 200)
    const cancellation = (await cRes.json())?.data

    // 2) Confirm it.
    const confRes = await fetch(`https://api.duffel.com/air/order_cancellations/${cancellation.id}/actions/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, Accept: 'application/json' },
    })
    const confirmed = confRes.ok ? (await confRes.json())?.data : cancellation

    // 3) Mark the ledger row cancelled.
    if (url && anon && auth) {
      await fetch(`${url}/rest/v1/bookings?id=eq.${bookingId}`, {
        method: 'PATCH',
        headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CHECK', notes: 'Cancelled via agent (TEST).' }),
      })
    }
    return json({
      booking_id: bookingId, status: 'cancelled',
      refund_amount: Number(confirmed?.refund_amount) || null, refund_currency: confirmed?.refund_currency || null,
    }, 200)
  } catch (e) {
    return json({ error: 'Cancellation failed.', code: 'upstream', detail: String(e).slice(0, 120) }, 200)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
