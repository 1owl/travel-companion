// Cache the last successful itinerary load per trip so the view still renders
// when the network is down (patchy travel signal). Plain localStorage; best-effort.

const keyFor = tripId => `itin_cache_${tripId}`

export function saveItinerary(tripId, payload) {
  try {
    localStorage.setItem(keyFor(tripId), JSON.stringify({ at: payload.at, data: payload }))
  } catch {
    // storage full / unavailable — caching is best-effort, ignore
  }
}

export function loadItinerary(tripId) {
  try {
    const raw = localStorage.getItem(keyFor(tripId))
    if (!raw) return null
    return JSON.parse(raw).data
  } catch {
    return null
  }
}
