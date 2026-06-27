// Saved place ideas (Phase 2). Each returns { data, error } like the Supabase client.
import { supabase } from './supabase'
import { bookingLink, ledgerCategory } from './bookingLinks'

export function listSavedPlaces(tripId) {
  return supabase.from('saved_places').select('*').eq('trip_id', tripId).order('created_at')
}

// Persist a planner card as an idea. Factual fields come from the grounded card.
export function savePlace(tripId, card) {
  return supabase.from('saved_places').insert({
    trip_id: tripId,
    google_place_id: card.google_place_id || null,
    name: card.name,
    category: card.category || null,
    lat: card.lat ?? null,
    lng: card.lng ?? null,
    rating: card.rating ?? null,
    user_ratings_total: card.user_ratings_total ?? null,
    price_level: card.price_level ?? null,
    photo_ref: card.photo_url || null,
    maps_url: card.maps_url || null,
    why: card.why || null,
    source: card.source || 'google_places',
    fetched_at: card.fetched_at || new Date().toISOString(),
    status: 'idea',
  }).select('*').single()
}

export function updatePlaceStatus(id, status) {
  return supabase.from('saved_places').update({ status }).eq('id', id)
}

export function removeSavedPlace(id) {
  return supabase.from('saved_places').delete().eq('id', id)
}

// Phase 3: turn a saved idea into a booking-ledger row (status TO BOOK), with a
// "Book now" deep link and a link back to the place for recall. Idempotent: a
// place already added to the itinerary won't create a second booking.
export async function addPlaceToItinerary(trip, place) {
  if (place.status === 'added_to_itinerary') {
    return { data: null, error: { message: 'Already added to your itinerary.' } }
  }
  const ins = await supabase.from('bookings').insert({
    trip_id: trip.id,
    title: place.name,
    category: ledgerCategory(place.category),
    status: 'TO BOOK',
    currency: trip.base_currency || 'AUD',
    link: bookingLink(place, trip),
    notes: place.maps_url ? `📍 ${place.name}` : null,
    saved_place_id: place.id,
  }).select('*').single()
  if (ins.error) return ins
  const upd = await supabase.from('saved_places').update({ status: 'added_to_itinerary' }).eq('id', place.id)
  return { data: ins.data, error: upd.error || null }
}
