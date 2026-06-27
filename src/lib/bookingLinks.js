// "Book now" deep links. We never process payment in-app — we hand off to the
// right provider with the place + trip dates pre-filled. Affiliate IDs are
// optional and configured via env, so they're easy to plug in later (roadmap).

const env = (k) => {
  try { return import.meta.env?.[k] } catch { return undefined }
}

// Map a place category to a sensible provider + URL.
export function bookingLink(place, trip = {}) {
  const cat = (place?.category || '').toLowerCase()
  const name = place?.name || ''
  const checkin = trip.start_date || ''
  const checkout = trip.end_date || ''

  if (cat === 'accommodation') {
    const u = new URL('https://www.booking.com/searchresults.html')
    u.searchParams.set('ss', name)
    if (checkin) u.searchParams.set('checkin', checkin)
    if (checkout) u.searchParams.set('checkout', checkout)
    const aid = env('VITE_BOOKING_AID')
    if (aid) u.searchParams.set('aid', aid)
    return u.toString()
  }

  if (cat === 'activity') {
    const u = new URL('https://www.getyourguide.com/s/')
    u.searchParams.set('q', name)
    const pid = env('VITE_GYG_PARTNER')
    if (pid) u.searchParams.set('partner_id', pid)
    return u.toString()
  }

  // sights, food, anything else → Maps (use the place's own maps link if we have it)
  if (place?.maps_url) return place.maps_url
  const u = new URL('https://www.google.com/maps/search/')
  u.searchParams.set('api', '1')
  u.searchParams.set('query', name)
  return u.toString()
}

// Map a saved-place category to a ledger category label.
export function ledgerCategory(cat) {
  switch ((cat || '').toLowerCase()) {
    case 'accommodation': return 'Hotel'
    case 'activity': return 'Activity'
    case 'food': return 'Food'
    default: return 'Attraction'
  }
}
