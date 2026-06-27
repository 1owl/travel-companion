// Travel photography used across the marketing site and the app.
// Files live in /public/photos (see that folder's README). Swap freely — keep the
// same filenames, or edit the list here. Imagery is content, so these sit outside
// the design tokens; any text laid over a photo uses a token-built scrim for contrast.

export const PHOTOS = [
  { src: '/photos/villefranche.jpg', place: 'Villefranche-sur-Mer', region: 'Côte d’Azur' },
  { src: '/photos/saint-tropez.jpg', place: 'Saint-Tropez', region: 'Côte d’Azur' },
  { src: '/photos/maldives-sunset.jpg', place: 'Overwater at dusk', region: 'Maldives' },
  { src: '/photos/maldives-pool.jpg', place: 'Lagoon poolside', region: 'Maldives' },
]

const FRANCE = ['/photos/villefranche.jpg', '/photos/saint-tropez.jpg']
const TROPICAL = ['/photos/maldives-sunset.jpg', '/photos/maldives-pool.jpg']

// Stable hash (no Math.random — covers must be deterministic per trip).
function hash(key = '') {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

// Pick a cover photo for a trip. Matches obvious destinations by name, otherwise
// falls back to a stable choice keyed off the trip id/name.
export function coverFor(trip) {
  const name = (typeof trip === 'string' ? trip : trip?.name || '').toLowerCase()
  const key = typeof trip === 'string' ? trip : (trip?.id || trip?.name || '')
  const h = hash(key)
  if (/(france|paris|nice|riviera|c[oô]te|provence|europe|italy|spain|portugal|greece)/.test(name)) return FRANCE[h % FRANCE.length]
  if (/(maldives|beach|island|tropic|bali|fiji|hawaii|lagoon|reef|caribbean|thailand)/.test(name)) return TROPICAL[h % TROPICAL.length]
  return PHOTOS[h % PHOTOS.length].src
}
