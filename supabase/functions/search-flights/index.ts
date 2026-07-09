// Supabase Edge Function: search-flights
// Flight price comparison via Duffel. Returns normalised offers as OPTIONS to
// compare — every result carries its source + a fetched_at timestamp and is
// never presented as a guaranteed live price. Booking deep-links out (no in-app
// payment, no PCI scope). The Duffel key stays server-side.
//
// Deploy:  supabase functions deploy search-flights
// Secret:  supabase secrets set DUFFEL_API_KEY=duffel_test_...
// Optional: DUFFEL_VERSION (default v2)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function googleFlights(origin: string, destination: string, depart: string, ret?: string) {
  const q = `flights from ${origin} to ${destination} on ${depart}` + (ret ? ` returning ${ret}` : '')
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q)
}

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'search-flights', 6, 60, true); if (blocked) return blocked

  const key = Deno.env.get('DUFFEL_API_KEY')
  if (!key) return json({ error: 'Flight search not configured (missing Duffel key).' }, 503)
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'

  let origin = '', destination = '', depart_date = '', return_date = '', adults = 1
  try {
    const b = await req.json()
    origin = (b?.origin ?? '').toString().trim().toUpperCase()
    destination = (b?.destination ?? '').toString().trim().toUpperCase()
    depart_date = (b?.depart_date ?? '').toString().trim()
    return_date = (b?.return_date ?? '').toString().trim()
    adults = Math.max(1, Math.min(9, Number(b?.adults) || 1))
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  if (!origin || !destination || !depart_date) {
    return json({ error: 'Need origin, destination and a departure date.' }, 400)
  }

  const slices: any[] = [{ origin, destination, departure_date: depart_date }]
  if (return_date) slices.push({ origin: destination, destination: origin, departure_date: return_date })
  const passengers = Array.from({ length: adults }, () => ({ type: 'adult' }))

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 55_000)
    const resp = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Duffel-Version': version,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ data: { slices, passengers, cabin_class: 'economy' } }),
    })
    clearTimeout(t)
    if (!resp.ok) {
      const detail = await resp.text()
      return json({ error: 'Flight search failed — check the Duffel key/quota.', detail: detail.slice(0, 300) }, 502)
    }
    const data = await resp.json()
    const offers = data?.data?.offers || []
    const fetched_at = new Date().toISOString()

    const results = offers.slice(0, 20).map((o: any) => {
      const out = o.slices?.[0]
      const segs = out?.segments || []
      const first = segs[0], last = segs[segs.length - 1]
      return {
        id: o.id,
        source: 'duffel',
        airline: o.owner?.name || segs[0]?.operating_carrier?.name || 'Airline',
        price: Number(o.total_amount),
        currency: o.total_currency,
        stops: Math.max(0, segs.length - 1),
        duration: out?.duration || null,        // ISO-8601, e.g. PT2H5M
        depart_at: first?.departing_at || null,
        arrive_at: last?.arriving_at || null,
        origin, destination,
        deep_link: googleFlights(origin, destination, depart_date, return_date || undefined),
        fetched_at,
      }
    }).filter((r: any) => Number.isFinite(r.price))

    results.sort((a: any, b: any) => a.price - b.price)
    const test = (key || '').startsWith('duffel_test')
    return json({ source: 'duffel', test, fetched_at, query: { origin, destination, depart_date, return_date, adults }, results })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return json({ error: aborted ? 'Flight search timed out. Please try again.' : 'Flight search error.' }, aborted ? 504 : 502)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
