// Supabase Edge Function: search-stays
// Live accommodation search via Duffel Stays. The trip stores a place name, not
// coordinates, so we first geocode it with Google Places (New), then run a Duffel
// Stays search by lat/lng. Wrapped per the playbook: timeout, graceful empty,
// 503 if a key is missing. Secrets: DUFFEL_API_KEY, GOOGLE_PLACES_API_KEY.
// Optional: DUFFEL_VERSION (default v2).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const blocked = await guard(req, 'search-stays', 6, 60, true); if (blocked) return blocked

  const duffel = Deno.env.get('DUFFEL_API_KEY')
  const places = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!duffel) return json({ error: 'Stays not configured (missing Duffel key).' }, 503)
  if (!places) return json({ error: 'Stays not configured (missing Google Places key).' }, 503)
  const version = Deno.env.get('DUFFEL_VERSION') || 'v2'

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }
  const place = String(body.place || '').trim()
  const checkIn = String(body.check_in || '').trim()
  const checkOut = String(body.check_out || '').trim()
  const adults = Math.min(Math.max(Number(body.adults) || 2, 1), 8)
  if (!place) return json({ error: 'Enter a city or area to search.' }, 400)
  if (!checkIn || !checkOut) return json({ error: 'Pick check-in and check-out dates.' }, 400)

  try {
    // 1) Geocode the place → coordinates (Google Places New).
    const geo = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': places,
        'X-Goog-FieldMask': 'places.location,places.displayName',
      },
      body: JSON.stringify({ textQuery: place, maxResultCount: 1 }),
    }, 8000)
    if (!geo.ok) return json({ error: 'Could not locate that place.', detail: (await geo.text()).slice(0, 160) }, 502)
    const gj = await geo.json()
    const loc = gj.places?.[0]?.location
    if (!loc) return json({ source: 'duffel_stays', results: [], error: 'No match for that place.' }, 200)

    // 2) Duffel Stays search by coordinates.
    const guests = Array.from({ length: adults }, () => ({ type: 'adult' }))
    const resp = await fetchWithTimeout('https://api.duffel.com/stays/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${duffel}`,
        'Duffel-Version': version,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        data: {
          rooms: 1,
          check_in_date: checkIn,
          check_out_date: checkOut,
          guests,
          location: { radius: 12, geographic_coordinates: { latitude: loc.latitude, longitude: loc.longitude } },
        },
      }),
    }, 55000)
    const nights = nightsBetween(checkIn, checkOut)
    if (!resp.ok) {
      // Duffel Stays not enabled (commonly 403 on test tokens) — fall back to real
      // hotels from Google so the tab still works; live prices open on Booking.com.
      const fb = await googleHotels(place, checkIn, checkOut, places)
      return json({ source: 'google_places', fetched_at: new Date().toISOString(), nights, query: { place, checkIn, checkOut, adults }, results: fb }, 200)
    }
    const data = await resp.json()
    const results = (data?.data?.results || []).map((r: any) => {
      const a = r.accommodation || {}
      const total = Number(r.cheapest_rate_total_amount)
      return {
        id: r.id,
        name: a.name || 'Hotel',
        rating: typeof a.rating === 'number' ? a.rating : null,
        review_score: a.review_score ?? null,
        price: Number.isFinite(total) ? total : null,
        per_night: Number.isFinite(total) && nights > 0 ? Math.round(total / nights) : null,
        price_level: null,
        currency: r.cheapest_rate_currency || 'AUD',
        address: a.location?.address?.line_one || a.location?.address?.city_name || place,
        photo: a.photos?.[0]?.url || null,
        deep_link: bookingLink(a.name || place, place, checkIn, checkOut),
        source: 'duffel_stays',
      }
    }).filter((s: { price: number | null }) => s.price != null)
      .sort((x: any, y: any) => (x.price ?? 0) - (y.price ?? 0))

    // No Duffel results → still offer the Google fallback rather than an empty tab.
    if (!results.length) {
      const fb = await googleHotels(place, checkIn, checkOut, places)
      return json({ source: 'google_places', fetched_at: new Date().toISOString(), nights, query: { place, checkIn, checkOut, adults }, results: fb }, 200)
    }
    return json({ source: 'duffel_stays', test: (duffel || '').startsWith('duffel_test'), fetched_at: new Date().toISOString(), nights, query: { place, checkIn, checkOut, adults }, results }, 200)
  } catch (e) {
    return json({ source: 'duffel_stays', results: [], error: 'Stays search timed out. Please try again.', detail: String(e).slice(0, 160) }, 200)
  }
})

const PRICE_BAND: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

// Fallback: real hotels from Google Places (New) when Duffel Stays is unavailable.
// No live number — we return a price band + a Booking.com link to check & book.
async function googleHotels(place: string, checkIn: string, checkOut: string, key: string) {
  try {
    const r = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.photos',
      },
      body: JSON.stringify({ textQuery: `hotels in ${place}`, maxResultCount: 12 }),
    }, 9000)
    if (!r.ok) return []
    const data = await r.json()
    const items = await Promise.all((data.places || []).map(async (p: any) => ({
      id: p.id,
      name: p.displayName?.text || 'Hotel',
      rating: typeof p.rating === 'number' ? p.rating : null,
      review_score: null,
      price: null,
      per_night: null,
      price_level: PRICE_BAND[p.priceLevel] || null,
      currency: null,
      address: p.formattedAddress || place,
      photo: await resolvePhoto(p.photos?.[0]?.name, key),
      deep_link: bookingLink(p.displayName?.text || place, place, checkIn, checkOut),
      source: 'google_places',
    })))
    return items
  } catch { return [] }
}

async function resolvePhoto(photoName: string | null, key: string): Promise<string | null> {
  if (!photoName) return null
  try {
    const r = await fetchWithTimeout(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': key } }, 6000)
    if (!r.ok) return null
    const d = await r.json()
    return d.photoUri || null
  } catch { return null }
}

function nightsBetween(a: string, b: string) {
  const d1 = Date.parse(a), d2 = Date.parse(b)
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0
  return Math.max(0, Math.round((d2 - d1) / 86_400_000))
}

// A Booking.com search link for the hotel (live prices + booking happen there).
function bookingLink(name: string, place: string, checkIn: string, checkOut: string) {
  const ss = encodeURIComponent(`${name} ${place}`)
  return `https://www.booking.com/searchresults.html?ss=${ss}&checkin=${checkIn}&checkout=${checkOut}`
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
