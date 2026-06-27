// Client wrapper for the /planner Edge Function. Defensive: timeout + graceful
// empty states, and it never surfaces a price the payload didn't carry.

import { supabase } from './supabase'

const VALID_PRICE = new Set(['Free', '$', '$$', '$$$', '$$$$'])

// The only place a price may come from is the grounded `price_level` field
// (sourced from Google). Anything else → no price shown. This is the guard the
// "never invent prices" rule leans on at the UI layer.
export function cardPrice(card) {
  return card && VALID_PRICE.has(card.price_level) ? card.price_level : ''
}

// Normalise the function's cards to a known shape; drop anything without a name.
export function coerceCards(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(c => c && typeof c.name === 'string' && c.name.trim())
    .map(c => ({
      google_place_id: c.google_place_id || null,
      name: c.name,
      category: typeof c.category === 'string' ? c.category : 'sight',
      why: typeof c.why === 'string' ? c.why : '',
      rating: typeof c.rating === 'number' ? c.rating : null,
      user_ratings_total: typeof c.user_ratings_total === 'number' ? c.user_ratings_total : null,
      price_level: VALID_PRICE.has(c.price_level) ? c.price_level : null,
      lat: typeof c.lat === 'number' ? c.lat : null,
      lng: typeof c.lng === 'number' ? c.lng : null,
      maps_url: c.maps_url || null,
      photo_url: c.photo_url || null,
      source: c.source || 'google_places',
      fetched_at: c.fetched_at || null,
    }))
}

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('The planner timed out. Please try again.')), ms))

export async function askPlanner(message, history = [], { context = '', timeoutMs = 75000 } = {}) {
  try {
    const call = supabase.functions.invoke('planner', { body: { message, history, context } })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { reply: '', cards: [], error }
    return { reply: data?.reply || '', cards: coerceCards(data?.cards), error: data?.error ? { message: data.error } : null }
  } catch (e) {
    return { reply: '', cards: [], error: { message: e?.message || 'Planner unavailable.' } }
  }
}
