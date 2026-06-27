// Accommodation search (Duffel Stays) + saving stay quotes. Mirrors the flights
// lib: wrapped call with a hard timeout and graceful empty state, and saved stays
// keep their source + fetched_at so they're never mistaken for a live price.
import { supabase } from './supabase'

export function coerceStays(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(s => s && typeof s.name === 'string' && s.name.trim())
    .map(s => ({
      id: s.id || null,
      name: s.name,
      rating: typeof s.rating === 'number' ? s.rating : null,
      review_score: s.review_score ?? null,
      price: Number.isFinite(Number(s.price)) ? Number(s.price) : null,        // live total (Duffel)
      per_night: Number.isFinite(Number(s.per_night)) ? Number(s.per_night) : null,
      price_level: s.price_level || null,                                       // band (Google fallback)
      currency: s.currency || null,
      address: s.address || '',
      photo: s.photo || null,
      deep_link: s.deep_link || null,
      source: s.source || 'duffel_stays',
    }))
}

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('The stay search timed out. Please try again.')), ms))

export async function searchStays({ place, check_in, check_out, adults }, { timeoutMs = 70000 } = {}) {
  try {
    const call = supabase.functions.invoke('search-stays', { body: { place, check_in, check_out, adults } })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { results: [], source: null, error }
    return {
      results: coerceStays(data?.results),
      source: data?.source || null,
      test: !!data?.test,
      fetched_at: data?.fetched_at || null,
      nights: data?.nights || 0,
      error: data?.error ? { message: data.error } : null,
    }
  } catch (e) {
    return { results: [], source: null, error: { message: e?.message || 'Stays unavailable.' } }
  }
}

// Saved stays live in the shared price_quotes table with kind='stay'.
export function listStayQuotes(tripId) {
  return supabase.from('price_quotes').select('*').eq('trip_id', tripId).eq('kind', 'stay')
    .order('created_at', { ascending: false })
}

export function saveStayQuote(trip, stay, query = {}) {
  return supabase.from('price_quotes').insert({
    trip_id: trip.id,
    kind: 'stay',
    source: stay.source || 'duffel_stays',
    title: stay.name,
    destination: query.place || null,
    depart_date: query.check_in || null,
    return_date: query.check_out || null,
    price: stay.price ?? null,
    currency: stay.currency || null,
    deep_link: stay.deep_link || null,
    fetched_at: stay.fetched_at || new Date().toISOString(),
  }).select('*').single()
}

export function removeStayQuote(id) {
  return supabase.from('price_quotes').delete().eq('id', id)
}
