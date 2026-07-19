// Supabase Edge Function: create-booking
// The only server path that creates a Duffel ORDER. v1 is TEST-MODE ONLY — it
// refuses unless DUFFEL_API_KEY is a test key, so no real card is ever charged.
// Re-validates the offer server-side (never trusts the client's amount), creates
// an instant order paid from the Duffel test balance, then records a BOOKED row
// in the caller's ledger (RLS-scoped via their JWT). Passenger names go to Duffel;
// nothing sensitive is logged.
//
// Deploy:  supabase functions deploy create-booking
// Secrets: DUFFEL_API_KEY (must be duffel_test_… in v1)   Optional: DUFFEL_VERSION

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'create-booking', 4, 20, true); if (blocked) return blocked

  const key = Deno.env.get('DUFFEL_API_KEY')
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'
  if (!key) return json({ error: 'Booking not configured.', code: 'not_configured' }, 503)
  // Hard safety rail: real spend is out of scope for v1.
  if (!key.startsWith('duffel_test')) {
    return json({ error: 'Live booking is disabled in this version (test mode only).', code: 'not_supported' }, 200)
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const offerId = String(body.offer_id || '').trim()
  const tripId = String(body.trip_id || '').trim()
  const passengers = Array.isArray(body.passengers) ? body.passengers : []
  if (!offerId || !tripId || !passengers.length) return json({ error: 'offer_id, trip_id and passengers are required.', code: 'validation' }, 400)

  try {
    // 1) Re-fetch + re-price the offer — never trust the client's number.
    const offRes = await duffel(`air/offers/${encodeURIComponent(offerId)}`, key, version)
    if (offRes.status === 404) return json({ error: 'Offer expired before booking.', code: 'OFFER_EXPIRED', recovery_hint: 'Re-price with get_offer and get fresh approval.' }, 200)
    if (!offRes.ok) return json({ error: `Duffel ${offRes.status}.`, code: 'UPSTREAM_ERROR' }, 200)
    const offer = (await offRes.json())?.data
    const amount = Number(offer?.total_amount), currency = offer?.total_currency
    if (!offer || !Number.isFinite(amount)) return json({ error: 'Offer no longer available.', code: 'AVAILABILITY_LOST' }, 200)
    if (body.expected_amount != null && (Number(body.expected_amount) !== amount || body.expected_currency !== currency)) {
      return json({ error: `Price moved to ${amount} ${currency}.`, code: 'PRICE_MOVED', recovery_hint: 'Re-approve the new price.' }, 200)
    }

    // 2) Create the instant order, paid from the test balance.
    const orderRes = await fetch('https://api.duffel.com/air/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: {
        type: 'instant', selected_offers: [offerId],
        passengers: passengers.map((p: any) => ({ given_name: p.given_name, family_name: p.family_name, born_on: p.born_on, type: 'adult' })),
        payments: [{ type: 'balance', amount: String(amount), currency }],
      } }),
    })
    if (!orderRes.ok) {
      const detail = (await orderRes.text()).slice(0, 200)
      return json({ error: 'Duffel rejected the order.', code: 'UPSTREAM_ERROR', detail }, 200)
    }
    const order = (await orderRes.json())?.data
    const orderId = order?.id || null
    const bookingRef = order?.booking_reference || null

    // 3) Record it in the caller's ledger via PostgREST (RLS applies).
    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const auth = req.headers.get('Authorization') || ''
    let bookingRow = null
    if (url && anon && auth) {
      const ins = await fetch(`${url}/rest/v1/bookings`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          trip_id: tripId, title: `Flight — ${bookingRef || orderId}`, category: 'Flight',
          amount, currency, status: 'BOOKED', confirmation_no: orderId, vendor: 'Duffel (TEST)',
          notes: 'Booked via agent (TEST order — not a real fare).',
        }),
      })
      if (ins.ok) bookingRow = (await ins.json())?.[0] || null
    }

    return json({
      order_id: orderId, booking_reference: bookingRef, booking_id: bookingRow?.id || null,
      amount, currency, test: true,
    }, 200)
  } catch (e) {
    return json({ error: 'Booking failed.', code: 'UPSTREAM_ERROR', detail: String(e).slice(0, 120) }, 200)
  }
})

async function duffel(path: string, key: string, version: string) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000)
  try { return await fetch(`https://api.duffel.com/${path}`, { headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, Accept: 'application/json' }, signal: ac.signal }) } finally { clearTimeout(t) }
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
