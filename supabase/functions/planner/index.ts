// Supabase Edge Function: planner
// Grounded AI destination planner. Claude runs a tool-use loop with a single
// `search_places` tool backed by the Google Places API (New). Recommendations
// are GROUNDED in the Google payload — the model picks places and writes a short
// "why"; factual fields (rating, price level, location, photo) come only from
// Google. The model is told never to state prices or hours not in the payload.
//
// Both keys stay server-side. Photos are resolved to key-free CDN URLs here, so
// the browser never sees the Google key.
//
// Deploy:  supabase functions deploy planner
// Secrets: ANTHROPIC_API_KEY (shared), GOOGLE_PLACES_API_KEY
// Optional: PLANNER_MODEL (default claude-sonnet-4-6)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = [
  'You are a travel destination planner inside a trip app.',
  'To suggest places you MUST call the search_places tool — only recommend places it returns.',
  'Never state a price, entry fee, or opening hours unless that exact value is present in the tool payload;',
  'if asked and it is not in the payload, say you don\'t have current pricing/hours and suggest checking the source.',
  'Keep each recommendation\'s "why" to one helpful sentence. Categorise each as sight, food, activity, or accommodation.',
].join(' ')

const TOOLS = [{
  name: 'search_places',
  description: 'Search Google for real places (restaurants, sights, activities) in a location.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for, e.g. "things to see", "bistros"' },
      location: { type: 'string', description: 'City/area, e.g. "Nice, France"' },
      type: { type: 'string', enum: ['sight', 'food', 'activity', 'accommodation'], description: 'Kind of place' },
    },
    required: ['query', 'location'],
  },
}]

const OUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Short friendly summary of the suggestions.' },
    places: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          place_id: { type: 'string', description: 'id from a search_places result' },
          name: { type: 'string' },
          category: { type: 'string', description: 'sight | food | activity | accommodation' },
          why: { type: 'string', description: 'one-line reason to go' },
        },
        required: ['place_id', 'name', 'category', 'why'],
      },
    },
  },
  required: ['reply', 'places'],
}

const PRICE = {
  PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

const cache = new Map<string, { at: number; data: any[] }>()
const DAY = 86_400_000

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'planner', 5, 40, true); if (blocked) return blocked

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const placesKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!anthropicKey || !placesKey) {
    return json({ error: 'Planner not configured (missing API keys).' }, 503)
  }
  const model = Deno.env.get('PLANNER_MODEL') || 'claude-sonnet-4-6'

  let message = '', history: any[] = [], context = ''
  try {
    const body = await req.json()
    message = (body?.message ?? '').toString()
    history = Array.isArray(body?.history) ? body.history : []
    context = (body?.context ?? '').toString().slice(0, 4000)
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  if (!message.trim()) return json({ error: 'Ask the planner something first.' }, 400)

  // Ground suggestions in the traveller's existing itinerary when provided.
  const sys = context
    ? SYSTEM + ' The traveller already has this trip underway — use the context below to'
      + ' tailor suggestions: recommend places that fit the destination and fill gaps in'
      + ' their plan, ideally near where they are staying and on free days; do NOT'
      + ' re-suggest things they already have booked; and reference relevant dates or'
      + ' areas in your reply when useful.\n\n=== TRIP CONTEXT ===\n' + context
    : SYSTEM

  const found = new Map<string, any>() // place_id -> trimmed Google data

  async function searchPlaces({ query, location, type }: any) {
    const key = `${type || ''}|${location || ''}|${query}`.toLowerCase()
    const hit = cache.get(key)
    let results: any[]
    if (hit && Date.now() - hit.at < DAY) {
      results = hit.data
    } else {
      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': placesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.location,places.googleMapsUri,places.photos,places.types,places.editorialSummary',
        },
        body: JSON.stringify({ textQuery: `${query} in ${location}`, maxResultCount: 8 }),
      })
      if (!resp.ok) {
        const detail = await resp.text()
        throw new Error(`places_${resp.status}:${detail.slice(0, 200)}`)
      }
      const data = await resp.json()
      results = (data.places || []).map((p: any) => ({
        place_id: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        rating: p.rating ?? null,
        user_ratings_total: p.userRatingCount ?? null,
        price_level: PRICE[p.priceLevel as keyof typeof PRICE] || null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        maps_url: p.googleMapsUri || null,
        types: p.types || [],
        photo_name: p.photos?.[0]?.name || null,
        summary: p.editorialSummary?.text || '',
      }))
      cache.set(key, { at: Date.now(), data: results })
    }
    for (const r of results) found.set(r.place_id, r)
    // Hand the model only what it needs to choose + cite (no key material).
    return results.map((r) => ({
      place_id: r.place_id, name: r.name, address: r.address,
      rating: r.rating, user_ratings_total: r.user_ratings_total,
      price_level: r.price_level, types: r.types, summary: r.summary,
    }))
  }

  // ── Claude tool-use loop ──────────────────────────────────────────────────
  const messages: any[] = [
    ...history.map((h: any) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.text ?? '') })),
    { role: 'user', content: message },
  ]

  async function claude(extra: any, stage = 'chat') {
    let last = ''
    // Retry transient 5xx once (Anthropic api_error can be intermittent).
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1500, system: sys, messages, ...extra }),
      })
      if (resp.ok) return resp.json()
      last = `claude_${resp.status}@${stage}[${model}]:${(await resp.text()).slice(0, 160)}`
      if (resp.status < 500) break
    }
    throw new Error(last)
  }

  try {
    let res = await claude({ tools: TOOLS }, 'tools')
    for (let i = 0; i < 4 && res.stop_reason === 'tool_use'; i++) {
      messages.push({ role: 'assistant', content: res.content })
      const toolResults = []
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue
        try {
          const out = await searchPlaces(block.input)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) })
        } catch (e) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: String(e).slice(0, 200) })
        }
      }
      messages.push({ role: 'user', content: toolResults })
      res = await claude({ tools: TOOLS }, 'tools')
    }

    // ── Structured compile pass: which places + why, as JSON ──────────────────
    // No `tools` here — combining tools with structured outputs (output_config) is
    // unnecessary for a formatting pass and can trip the API. If structured output
    // is rejected, fall back to a plain "reply with JSON" instruction.
    messages.push({ role: 'assistant', content: res.content })
    messages.push({ role: 'user', content: 'Compile your final recommendations as JSON, using the place_id values from the search results.' })
    let text = '{}'
    try {
      const compiled = await claude({ output_config: { format: { type: 'json_schema', schema: OUT_SCHEMA } } }, 'compile')
      text = (compiled.content || []).find((b: any) => b.type === 'text')?.text || '{}'
    } catch (e) {
      if (!String(e).includes('claude_400')) throw e
      // Older/unsupported structured-output surface — ask for raw JSON instead.
      const compiled = await claude({}, 'compile-fallback')
      const raw = (compiled.content || []).find((b: any) => b.type === 'text')?.text || '{}'
      text = (raw.match(/\{[\s\S]*\}/) || ['{}'])[0]
    }
    let parsed: any = {}
    try { parsed = JSON.parse(text) } catch { parsed = {} }

    // ── Ground each pick in real Google data + resolve key-free photo URLs ────
    // Resolve photos in PARALLEL — sequential resolution was the main slowdown.
    const picks = (Array.isArray(parsed.places) ? parsed.places.slice(0, 10) : [])
      .map((pick: any) => ({ pick, g: found.get(pick.place_id) }))
      .filter((x: any) => x.g) // ignore anything the model invented that wasn't in results
    const cards = await Promise.all(picks.map(async ({ pick, g }: any) => ({
      google_place_id: g.place_id,
      name: g.name || pick.name,
      category: pick.category || 'sight',
      why: pick.why || '',
      rating: g.rating, user_ratings_total: g.user_ratings_total,
      price_level: g.price_level,            // from Google, may be null
      lat: g.lat, lng: g.lng, maps_url: g.maps_url,
      photo_url: await resolvePhoto(g.photo_name, placesKey),
      source: 'google_places',
      fetched_at: new Date().toISOString(),
    })))

    return json({ reply: parsed.reply || '', cards })
  } catch (e) {
    const msg = String(e)
    if (msg.includes('places_')) return json({ error: 'Place search failed — check the Places API key/quota.', detail: msg.slice(0, 200) }, 502)
    return json({ error: 'The planner had trouble. Please try again.', detail: msg.slice(0, 200) }, 502)
  }
})

// Resolve a Places photo to a key-free googleusercontent URL (skipHttpRedirect
// returns JSON with the public photoUri instead of redirecting with the key).
async function resolvePhoto(photoName: string | null, key: string): Promise<string | null> {
  if (!photoName) return null
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const resp = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=640&skipHttpRedirect=true`,
      { headers: { 'X-Goog-Api-Key': key }, signal: ctrl.signal })
    clearTimeout(t)
    if (!resp.ok) return null
    const data = await resp.json()
    return data.photoUri || null
  } catch {
    return null
  }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}
