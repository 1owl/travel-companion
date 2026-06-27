import { supabase } from './supabase'

// Place-aware photos via the image-search Edge Function (Unsplash). Results are
// cached per query for the life of the page load — so "fresh each visit" (a full
// reload pulls new photos) without hammering the API as you move around the app.
const cache = new Map() // cacheKey -> Promise<{ results, source, fetched_at }>

// Derive a search query from a trip: drop the year and tidy whitespace.
// "France 2026" -> "France"; "Tokyo Spring '27" -> "Tokyo Spring".
export function destinationOf(trip) {
  const name = (typeof trip === 'string' ? trip : trip?.name || '').trim()
  const cleaned = name
    .replace(/['’]\d{2}\b/g, ' ')          // 'apostrophe-year e.g. '27
    .replace(/\b(19|20)\d{2}\b/g, ' ')      // full year e.g. 2026
    .replace(/[—–-]+\s*$/g, ' ')            // trailing dashes
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || name
}

// Bias a trip's destination toward travel/holiday imagery (not, e.g., a person who
// happens to be named after the place, or generic stock for an ambiguous word).
export function coverQuery(trip) {
  const d = destinationOf(trip)
  return d ? `${d} travel destination` : 'travel destination landscape'
}

export async function searchImages(query, { count = 1, orientation = 'landscape' } = {}) {
  const q = (query || '').trim()
  if (!q) return { results: [], source: null }
  const cacheKey = `${q}|${count}|${orientation}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('image-search', {
        body: { query: q, count, orientation },
      })
      if (error || !data) return { results: [], source: null, error: error || true }
      return { results: data.results || [], source: data.source, fetched_at: data.fetched_at, error: data.error || null }
    } catch (e) {
      return { results: [], source: null, error: e }
    }
  })()

  cache.set(cacheKey, p)
  const settled = await p
  if (!settled.results?.length) cache.delete(cacheKey) // let a later attempt retry
  return settled
}

// Unsplash asks apps to ping the download endpoint when a photo is actually used.
// Fire-and-forget; failures are ignored.
export function trackImageUse(downloadLocation) {
  if (!downloadLocation) return
  try { supabase.functions.invoke('image-search', { body: { track: downloadLocation } }) } catch { /* ignore */ }
}
