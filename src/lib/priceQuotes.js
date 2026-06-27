// Saved price quotes (Phase 5). A quote persisted to a trip for recall — it
// keeps its source + fetched_at so it's never mistaken for a live price later.
import { supabase } from './supabase'

export function listQuotes(tripId) {
  return supabase.from('price_quotes').select('*').eq('trip_id', tripId).order('created_at', { ascending: false })
}

export function saveQuote(trip, offer, query = {}) {
  return supabase.from('price_quotes').insert({
    trip_id: trip.id,
    kind: 'flight',
    source: offer.source || 'duffel',
    title: `${offer.origin}→${offer.destination} · ${offer.airline}`,
    origin: offer.origin || query.origin || null,
    destination: offer.destination || query.destination || null,
    depart_date: query.depart_date || null,
    return_date: query.return_date || null,
    price: offer.price ?? null,
    currency: offer.currency || null,
    deep_link: offer.deep_link || null,
    fetched_at: offer.fetched_at || new Date().toISOString(),
  }).select('*').single()
}

export function removeQuote(id) {
  return supabase.from('price_quotes').delete().eq('id', id)
}
