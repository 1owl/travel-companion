// Supabase Edge Function: trip-adviser
// The "Trip Adviser" research engine. Runs Claude with the web_search server tool
// to ground flights / stays / destination context, and returns a structured,
// comparison-ready JSON (budget/mid/premium tiers + packages). If web_search isn't
// available on the account, it degrades to knowledge-based ESTIMATES (every figure
// flagged is_estimate) rather than failing. Wrapped: timeout + graceful error.
// Secret: ANTHROPIC_API_KEY. Optional: TRIP_ADVISER_MODEL (default claude-sonnet-4-6).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You are the Trip Adviser engine inside a travel planning app. Your job is to research a holiday destination and return a structured, comparison-ready set of travel options: flights, accommodation, and a destination briefing. You do NOT book anything — you research, price, and rank options so the user can choose.

## OPERATING PRINCIPLES
1. Use the web_search tool to ground prices, routes, and availability in current data whenever it is available. Never invent prices or flight numbers. If you cannot verify a figure, label it as an estimate with "is_estimate": true.
2. Search in this order, and run separate searches per item (never bundle): flights (origin→destination for the dates, cheapest + 2 alternatives); accommodation (one search per tier: budget / mid / premium); destination context (best areas to stay, safety, seasonality, getting around).
3. Optimise for a RANGE of choices, not a single answer. Always return a budget, mid-range, and premium option for both flights and stays.
4. Be transport-mode aware: if the destination is reachable cheaper by train/bus/ferry and the saving is material, surface it in alternative_transport.
5. Respect every hard constraint (budget ceiling, dates, party size, accessibility, pets, non-stop only). Soft preferences (vibe, cuisine, interests) shape ranking, not inclusion.
6. Be honest about freshness: treat prices as indicative snapshots and tell the user to confirm at the booking link.

## SCORING (how you rank within each tier)
Rank each option with a 0–100 value_score blending: price vs budget (40%), fit to preferences (30%), convenience (20%), quality signal (10%). Briefly justify the top pick of each category in "why".

## OUTPUT
Respond with ONLY valid JSON — no markdown, no code fences, no preamble. Match this schema exactly. Use the user's budget currency throughout. Use ISO dates. If a field is unknown use null — don't omit it.

{
  "summary": { "destination": "", "headline": "", "best_time_to_visit": "", "estimated_total_cost": { "low": 0, "high": 0, "currency": "AUD" }, "trip_length_nights": 0, "weather_outlook": "", "safety_notes": null, "visa_entry_note": "" },
  "flights": [ { "tier": "budget|mid|premium", "airline": "", "route": "", "stops": 0, "total_duration": "", "cabin": "economy", "price_per_person": 0, "price_total": 0, "currency": "AUD", "is_estimate": false, "value_score": 0, "why": "", "booking_search_url": "", "source": "" } ],
  "alternative_transport": [ { "mode": "train|bus|ferry", "note": "", "est_price": 0, "currency": "AUD" } ],
  "accommodation": [ { "tier": "budget|mid|premium", "name": "", "type": "hotel|ryokan|apartment|hostel", "area": "", "price_per_night": 0, "price_total_stay": 0, "currency": "AUD", "rating": 0, "review_count": 0, "key_features": [], "is_estimate": false, "value_score": 0, "why": "", "booking_search_url": "", "source": "" } ],
  "areas_to_stay": [ { "name": "", "best_for": "", "vibe": "", "transit_access": "" } ],
  "suggested_packages": [ { "label": "Best Value|Sweet Spot|Premium", "flight_tier": "budget", "accommodation_tier": "mid", "estimated_total": 0, "currency": "AUD", "pitch": "" } ],
  "next_steps": [], "assumptions": [], "disclaimer": "Prices are indicative snapshots from web research and must be confirmed at the booking link before purchase."
}

## RULES OF THUMB
- Return 3 flight options (one per tier) and 4–6 accommodation options (≥1 per tier). Build 3 suggested_packages spanning the price range.
- If a hard constraint can't be met within budget, return the closest options AND say so in assumptions.
- Never exceed the JSON schema.`

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const blocked = await guard(req, 'trip-adviser', 3, 15, true); if (blocked) return blocked
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'Trip Adviser not configured (missing Anthropic key).' }, 503)
  const model = Deno.env.get('TRIP_ADVISER_MODEL') || 'claude-sonnet-4-6'

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }
  const input = body.input ?? {}
  const note = String(body.prompt || '').trim()
  if (!input || (!('destination' in (input as object)) && !note)) {
    return json({ error: 'Tell me where you want to go (spin the globe or type it).' }, 400)
  }
  const userText = 'Research this trip and return the JSON.\n\nINPUT:\n' + JSON.stringify(input, null, 2)
    + (note ? `\n\nExtra notes from the traveller: ${note}` : '')

  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }]

  async function call(messages: unknown[], useTools: boolean) {
    return await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages, ...(useTools ? { tools } : {}) }),
    }, 110000)
  }

  try {
    let useTools = true
    let messages: any[] = [{ role: 'user', content: userText }]
    let res: any = null
    let grounded = true
    for (let i = 0; i < 6; i++) {
      const resp = await call(messages, useTools)
      if (!resp.ok) {
        const detail = (await resp.text()).slice(0, 200)
        if (useTools) { useTools = false; grounded = false; messages = [{ role: 'user', content: userText }]; continue } // web_search unavailable → estimates
        return json({ error: 'The adviser had trouble. Please try again.', detail }, 502)
      }
      res = await resp.json()
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue }
      break
    }
    const text = (res?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    const parsed = extractJson(text)
    if (!parsed) return json({ error: 'Could not parse the adviser result. Please try again.' }, 502)
    return json({ result: parsed, grounded, fetched_at: new Date().toISOString() }, 200)
  } catch (e) {
    return json({ error: 'The adviser timed out. Please try again.', detail: String(e).slice(0, 160) }, 502)
  }
})

function extractJson(text: string) {
  if (!text) return null
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a === -1 || b === -1) return null
  try { return JSON.parse(t.slice(a, b + 1)) } catch { return null }
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } })
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
