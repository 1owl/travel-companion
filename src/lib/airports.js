// A compact set of major international airports, enough to map a user's rough
// location to a sensible origin for flight search. Not exhaustive — nearest of
// these by great-circle distance.
export const AIRPORTS = [
  { iata: 'SYD', city: 'Sydney', lat: -33.95, lng: 151.18 },
  { iata: 'MEL', city: 'Melbourne', lat: -37.67, lng: 144.84 },
  { iata: 'BNE', city: 'Brisbane', lat: -27.38, lng: 153.12 },
  { iata: 'PER', city: 'Perth', lat: -31.94, lng: 115.97 },
  { iata: 'ADL', city: 'Adelaide', lat: -34.95, lng: 138.53 },
  { iata: 'AKL', city: 'Auckland', lat: -37.01, lng: 174.79 },
  { iata: 'SIN', city: 'Singapore', lat: 1.36, lng: 103.99 },
  { iata: 'HKG', city: 'Hong Kong', lat: 22.31, lng: 113.91 },
  { iata: 'NRT', city: 'Tokyo', lat: 35.77, lng: 140.39 },
  { iata: 'ICN', city: 'Seoul', lat: 37.46, lng: 126.44 },
  { iata: 'BKK', city: 'Bangkok', lat: 13.69, lng: 100.75 },
  { iata: 'DEL', city: 'Delhi', lat: 28.56, lng: 77.10 },
  { iata: 'DXB', city: 'Dubai', lat: 25.25, lng: 55.36 },
  { iata: 'IST', city: 'Istanbul', lat: 41.28, lng: 28.75 },
  { iata: 'JNB', city: 'Johannesburg', lat: -26.13, lng: 28.24 },
  { iata: 'CPT', city: 'Cape Town', lat: -33.97, lng: 18.60 },
  { iata: 'LHR', city: 'London', lat: 51.47, lng: -0.45 },
  { iata: 'CDG', city: 'Paris', lat: 49.01, lng: 2.55 },
  { iata: 'AMS', city: 'Amsterdam', lat: 52.31, lng: 4.76 },
  { iata: 'FRA', city: 'Frankfurt', lat: 50.04, lng: 8.56 },
  { iata: 'MAD', city: 'Madrid', lat: 40.47, lng: -3.56 },
  { iata: 'FCO', city: 'Rome', lat: 41.80, lng: 12.25 },
  { iata: 'JFK', city: 'New York', lat: 40.64, lng: -73.78 },
  { iata: 'LAX', city: 'Los Angeles', lat: 33.94, lng: -118.41 },
  { iata: 'ORD', city: 'Chicago', lat: 41.98, lng: -87.90 },
  { iata: 'YYZ', city: 'Toronto', lat: 43.68, lng: -79.61 },
  { iata: 'GRU', city: 'São Paulo', lat: -23.43, lng: -46.47 },
  { iata: 'MEX', city: 'Mexico City', lat: 19.44, lng: -99.07 },
]

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = d => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Nearest airport (by great-circle distance) to a coordinate, or null.
export function nearestAirport(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  let best = null, bestKm = Infinity
  for (const a of AIRPORTS) {
    const km = haversine(lat, lng, a.lat, a.lng)
    if (km < bestKm) { bestKm = km; best = a }
  }
  return best
}

// Promise-wrapped browser geolocation → nearest airport (null on deny/unavailable).
export function detectNearestAirport({ timeoutMs = 8000 } = {}) {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve(nearestAirport(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 600000 },
    )
  })
}
