// Client wrapper for the /search-flights Edge Function + ranking helpers.
// Results are OPTIONS to compare, each tagged with source + fetched_at; nothing
// is presented as a guaranteed live price.

import { supabase } from './supabase'

// Parse Duffel ISO-8601 duration (e.g. "PT2H5M") to minutes.
export function durationMinutes(iso) {
  if (!iso || typeof iso !== 'string') return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!m) return 0
  return (parseInt(m[1] || '0', 10) * 60) + parseInt(m[2] || '0', 10)
}

export function formatDuration(iso) {
  const t = durationMinutes(iso)
  if (!t) return ''
  return `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, '0')}m`
}

export function coerceOffers(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(o => o && Number.isFinite(Number(o.price)))
    .map(o => ({
      id: o.id || null,
      source: o.source || 'duffel',
      airline: o.airline || 'Airline',
      price: Number(o.price),
      currency: o.currency || '',
      stops: Number.isFinite(o.stops) ? o.stops : 0,
      duration: o.duration || null,
      depart_at: o.depart_at || null,
      arrive_at: o.arrive_at || null,
      origin: o.origin || '', destination: o.destination || '',
      deep_link: o.deep_link || null,
      fetched_at: o.fetched_at || null,
    }))
}

// Re-rank by a single "cheapest ↔ comfort" weight in [0,1]:
// 1 = pure price (cheapest first), 0 = pure comfort (fewest stops + shortest).
// Returns a new sorted array; never mutates the input.
export function rankOffers(offers, weight = 1) {
  const list = [...(offers || [])]
  if (list.length <= 1) return list
  const prices = list.map(o => o.price)
  const comforts = list.map(o => o.stops * 180 + durationMinutes(o.duration)) // stops weighted heavily
  const norm = (v, arr) => {
    const lo = Math.min(...arr), hi = Math.max(...arr)
    return hi === lo ? 0 : (v - lo) / (hi - lo)
  }
  const score = o => weight * norm(o.price, prices) + (1 - weight) * norm(o.stops * 180 + durationMinutes(o.duration), comforts)
  return list.sort((a, b) => score(a) - score(b))
}

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Flight search timed out. Please try again.')), ms))

export async function searchFlights(params, { timeoutMs = 70000 } = {}) {
  try {
    const call = supabase.functions.invoke('search-flights', { body: params })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { results: [], error }
    if (data?.error) return { results: [], error: { message: data.error } }
    return { results: coerceOffers(data?.results), source: data?.source, test: !!data?.test, fetched_at: data?.fetched_at, error: null }
  } catch (e) {
    return { results: [], error: { message: e?.message || 'Flight search unavailable.' } }
  }
}
