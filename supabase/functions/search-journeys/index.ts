// Supabase Edge Function: search-journeys
// "How to get there" — one call returns a comparable option per travel mode:
//   • flight  — live prices via Duffel (labelled TEST when the key is a test key)
//   • transit — real duration via Google Routes (classified train vs bus by the
//               dominant vehicle); NO price (ground prices are never fabricated)
//   • drive   — real duration via Google Routes
// Endpoints are geocoded with Google Places. CO₂ is NOT computed here — the client
// attaches it from distance_km so the emission factors live in one place
// (src/lib/co2.js). Every external call is wrapped (timeout + graceful partial):
// one mode failing never blanks the others.
//
// Deploy:  supabase functions deploy search-journeys
// Secrets: DUFFEL_API_KEY, GOOGLE_PLACES_API_KEY, GOOGLE_ROUTES_API_KEY
// Optional: DUFFEL_VERSION (default v2)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

import { guard } from '../_shared/guard.ts'

// Compact major-airport set (mirrors src/lib/airports.js) — maps a geocoded
// endpoint to a sensible IATA for the flight leg.
const AIRPORTS = [
  ['SYD', -33.95, 151.18], ['MEL', -37.67, 144.84], ['BNE', -27.38, 153.12], ['PER', -31.94, 115.97],
  ['ADL', -34.95, 138.53], ['AKL', -37.01, 174.79], ['SIN', 1.36, 103.99], ['HKG', 22.31, 113.91],
  ['NRT', 35.77, 140.39], ['ICN', 37.46, 126.44], ['BKK', 13.69, 100.75], ['DEL', 28.56, 77.10],
  ['DXB', 25.25, 55.36], ['IST', 41.28, 28.75], ['JNB', -26.13, 28.24], ['CPT', -33.97, 18.60],
  ['LHR', 51.47, -0.45], ['CDG', 49.01, 2.55], ['AMS', 52.31, 4.76], ['FRA', 50.04, 8.56],
  ['MAD', 40.47, -3.56], ['FCO', 41.80, 12.25], ['JFK', 40.64, -73.78], ['LAX', 33.94, -118.41],
  ['ORD', 41.98, -87.90], ['YYZ', 43.68, -79.61], ['GRU', -23.43, -46.47], ['MEX', 19.44, -99.07],
] as const

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function nearestIata(lat: number, lng: number) {
  let best = null, bestKm = Infinity
  for (const [iata, aLat, aLng] of AIRPORTS) {
    const km = haversineKm(lat, lng, aLat, aLng)
    if (km < bestKm) { bestKm = km; best = iata }
  }
  return best as string | null
}

// ISO-8601 duration ("PT2H5M") → minutes.
function isoToMinutes(iso?: string | null) {
  if (!iso) return null
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso)
  if (!m) return null
  return (Number(m[1] || 0) * 60) + Number(m[2] || 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'search-journeys', 6, 60, true); if (blocked) return blocked

  const duffel = Deno.env.get('DUFFEL_API_KEY')
  const places = Deno.env.get('GOOGLE_PLACES_API_KEY')
  const routes = Deno.env.get('GOOGLE_ROUTES_API_KEY')
  if (!places) return json({ error: 'Journeys not configured (missing Google Places key).' }, 503)
  const duffelVersion = Deno.env.get('DUFFEL_VERSION') || 'v2'

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }
  const origin = String(body.origin || '').trim()
  const destination = String(body.destination || '').trim()
  const departDate = String(body.depart_date || '').trim()
  const adults = Math.min(Math.max(Number(body.adults) || 1, 1), 9)
  if (!origin || !destination) return json({ error: 'Enter where you’re travelling from and to.' }, 400)

  try {
    // 1) Geocode both endpoints.
    const [o, d] = await Promise.all([geocode(origin, places), geocode(destination, places)])
    if (!o || !d) return json({ origin, destination, options: [], error: 'Could not locate one of those places.' }, 200)
    const distance_km = Math.round(haversineKm(o.lat, o.lng, d.lat, d.lng))
    const fetched_at = new Date().toISOString()

    // 2) Fetch each mode independently; a failure yields null, not a thrown request.
    const [flight, transit, drive] = await Promise.all([
      flightOption(o, d, departDate, adults, duffel, duffelVersion).catch(() => null),
      routes ? transitOption(o, d, routes).catch(() => null) : estimateOption(o, d, distance_km, 'train'),
      routes ? driveOption(o, d, routes).catch(() => null) : estimateOption(o, d, distance_km, 'drive'),
    ])
    const options = [flight, transit, drive].filter(Boolean)
    const test = !!(flight && (flight as any).test)
    return json({ origin, destination, distance_km, fetched_at, test, options }, 200)
  } catch (e) {
    return json({ origin, destination, options: [], error: 'Journey search failed.', detail: String(e).slice(0, 160) }, 200)
  }
})

// ── Geocode ───────────────────────────────────────────────────────────────
async function geocode(place: string, key: string) {
  const r = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.location,places.displayName' },
    body: JSON.stringify({ textQuery: place, maxResultCount: 1 }),
  }, 8000)
  if (!r.ok) return null
  const j = await r.json()
  const loc = j.places?.[0]?.location
  if (!loc) return null
  return { lat: loc.latitude as number, lng: loc.longitude as number, name: j.places?.[0]?.displayName?.text || place }
}

// ── Flight (Duffel) ─────────────────────────────────────────────────────────
async function flightOption(o: any, d: any, departDate: string, adults: number, key: string | undefined, version: string) {
  if (!key || !departDate) return null
  const oi = nearestIata(o.lat, o.lng), di = nearestIata(d.lat, d.lng)
  if (!oi || !di || oi === di) return null
  const resp = await fetchWithTimeout('https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Duffel-Version': version, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      data: {
        slices: [{ origin: oi, destination: di, departure_date: departDate }],
        passengers: Array.from({ length: adults }, () => ({ type: 'adult' })),
        cabin_class: 'economy',
      },
    }),
  }, 50000)
  if (!resp.ok) return null
  const data = await resp.json()
  const offers = (data?.data?.offers || []).map((of: any) => {
    const slice = of.slices?.[0], segs = slice?.segments || []
    return {
      id: of.id, airline: of.owner?.name || segs[0]?.operating_carrier?.name || 'Airline',
      price: Number(of.total_amount), currency: of.total_currency,
      stops: Math.max(0, segs.length - 1), duration: slice?.duration || null,
      depart_at: segs[0]?.departing_at || null, arrive_at: segs[segs.length - 1]?.arriving_at || null,
    }
  }).filter((x: any) => Number.isFinite(x.price)).sort((a: any, b: any) => a.price - b.price).slice(0, 12)
  if (!offers.length) return null
  const cheapest = offers[0]
  return {
    mode: 'flight', price: cheapest.price, currency: cheapest.currency,
    duration_min: isoToMinutes(cheapest.duration), duration_estimated: false,
    source: 'duffel', deep_link: googleFlights(oi, di, departDate),
    route: `${oi} → ${di}`, offers, test: (key || '').startsWith('duffel_test'),
  }
}

// ── Ground (Google Routes) ───────────────────────────────────────────────────
async function computeRoute(o: any, d: any, key: string, travelMode: 'TRANSIT' | 'DRIVE') {
  const r = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.legs.steps.transitDetails.transitLine.vehicle.type',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      destination: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
      travelMode,
    }),
  }, 12000)
  if (!r.ok) return null
  const j = await r.json()
  return j.routes?.[0] || null
}
async function transitOption(o: any, d: any, key: string) {
  const route = await computeRoute(o, d, key, 'TRANSIT')
  const secs = route ? Number(String(route.duration).replace('s', '')) : NaN
  if (!Number.isFinite(secs)) return null
  // Classify by the dominant transit vehicle: RAIL/SUBWAY → train, else bus.
  const types: string[] = []
  for (const leg of route.legs || []) for (const step of leg.steps || []) {
    const t = step?.transitDetails?.transitLine?.vehicle?.type
    if (t) types.push(String(t))
  }
  const isRail = types.some(t => /RAIL|SUBWAY|TRAM|HEAVY_RAIL|METRO/i.test(t))
  const mode = isRail ? 'train' : 'bus'
  return {
    mode, price: null, currency: null, duration_min: Math.round(secs / 60), duration_estimated: false,
    source: 'google_routes', deep_link: rome2rio(o.name, d.name),
  }
}
async function driveOption(o: any, d: any, key: string) {
  const route = await computeRoute(o, d, key, 'DRIVE')
  const secs = route ? Number(String(route.duration).replace('s', '')) : NaN
  if (!Number.isFinite(secs)) return null
  return {
    mode: 'drive', price: null, currency: null, duration_min: Math.round(secs / 60), duration_estimated: false,
    source: 'google_routes', deep_link: googleMapsDrive(o.name, d.name),
  }
}
// Fallback when the Routes key is absent: rough duration from distance + speed.
function estimateOption(o: any, d: any, distanceKm: number, mode: 'train' | 'drive') {
  const kmh = mode === 'train' ? 90 : 80
  const detour = mode === 'train' ? 1.2 : 1.25
  return {
    mode, price: null, currency: null,
    duration_min: Math.round((distanceKm * detour) / kmh * 60), duration_estimated: true,
    source: 'estimate',
    deep_link: mode === 'train' ? rome2rio(o.name, d.name) : googleMapsDrive(o.name, d.name),
  }
}

// ── Deep links ────────────────────────────────────────────────────────────
function googleFlights(oi: string, di: string, date: string) {
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(`flights from ${oi} to ${di} on ${date}`)
}
function rome2rio(a: string, b: string) {
  const slug = (s: string) => encodeURIComponent(s.trim().replace(/\s+/g, '-'))
  return `https://www.rome2rio.com/s/${slug(a)}/${slug(b)}`
}
function googleMapsDrive(a: string, b: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a)}&destination=${encodeURIComponent(b)}&travelmode=driving`
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
