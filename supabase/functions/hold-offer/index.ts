// Supabase Edge Function: hold-offer
// Places a Duffel "hold" order (pay later) to lock a fare's price without paying,
// where the fare supports it. TEST-mode only in v1. Returns the guarantee expiry.
//
// Deploy:  supabase functions deploy hold-offer
// Secret:  DUFFEL_API_KEY   Optional: DUFFEL_VERSION

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'hold-offer', 6, 40, true); if (blocked) return blocked

  const key = Deno.env.get('DUFFEL_API_KEY')
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'
  if (!key) return json({ error: 'Holds not configured.', code: 'not_configured' }, 503)
  if (!key.startsWith('duffel_test')) return json({ error: 'Holds disabled in this version (test mode only).', code: 'not_supported' }, 200)

  let offerId = ''
  try { offerId = String((await req.json())?.offer_id || '').trim() } catch { /* empty */ }
  if (!offerId) return json({ error: 'offer_id is required.', code: 'validation' }, 400)

  try {
    const r = await fetch('https://api.duffel.com/air/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ data: { type: 'hold', selected_offers: [offerId] } }),
    })
    if (!r.ok) return json({ error: 'This fare does not support holds.', code: 'not_supported', detail: (await r.text()).slice(0, 160) }, 200)
    const o = (await r.json())?.data
    return json({ hold_id: o?.id || null, expires_at: o?.payment_status?.payment_required_by || o?.payment_requirements?.price_guarantee_expires_at || null, test: true }, 200)
  } catch (e) {
    return json({ error: 'Could not place the hold.', code: 'upstream', detail: String(e).slice(0, 120) }, 200)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
