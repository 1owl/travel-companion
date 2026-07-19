// Supabase Edge Function: get-offer
// Re-price / re-validate a single Duffel offer immediately before booking.
// Returns the current total, currency, expiry and refundability, or a structured
// { error, code } when the offer has expired or lost availability. The client's
// create_booking tool calls this first and aborts on any price move.
//
// Deploy:  supabase functions deploy get-offer
// Secret:  DUFFEL_API_KEY   Optional: DUFFEL_VERSION (default v2)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'get-offer', 20, 200, true); if (blocked) return blocked

  const key = Deno.env.get('DUFFEL_API_KEY')
  if (!key) return json({ error: 'Offers not configured (missing Duffel key).', code: 'not_configured' }, 503)
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'

  let offerId = ''
  try { offerId = String((await req.json())?.offer_id || '').trim() } catch { /* empty */ }
  if (!offerId) return json({ error: 'offer_id is required.', code: 'validation' }, 400)

  try {
    const resp = await fetchWithTimeout(`https://api.duffel.com/air/offers/${encodeURIComponent(offerId)}`, {
      headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, Accept: 'application/json' },
    }, 15000)
    if (resp.status === 404) return json({ error: 'This offer has expired.', code: 'expired' }, 200)
    if (!resp.ok) return json({ error: `Duffel ${resp.status}.`, code: 'upstream' }, 200)
    const o = (await resp.json())?.data
    if (!o) return json({ error: 'Offer not available.', code: 'unavailable' }, 200)
    const expired = o.expires_at && Date.parse(o.expires_at) < Date.now()
    return json({
      offer_id: offerId,
      total_amount: Number(o.total_amount),
      total_currency: o.total_currency,
      expires_at: o.expires_at || null,
      refundable: o.conditions?.refund_before_departure?.allowed ?? null,
      changed: false,
      ...(expired ? { error: 'This offer has expired.', code: 'expired' } : {}),
      test: (key || '').startsWith('duffel_test'),
    }, 200)
  } catch (e) {
    return json({ error: 'Could not reach Duffel.', code: 'upstream', detail: String(e).slice(0, 120) }, 200)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
