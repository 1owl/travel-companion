// Client-side photo pool for the PUBLIC landing page.
//
// The landing is public, but image-search is JWT-gated (paid function, must 401
// anonymous callers per the launch-hardening invariant). So instead of calling it
// on every visit, we ship a pre-fetched pool (src/lib/landingPhotos.json, built by
// scripts/fetch-landing-photos.mjs) and pick from it here — no network, no 401s,
// no quota burn, yet still a different photo each visit.
//
// Returns the same shape useDynamicImage did, so the landing markup is unchanged.
import pool from './landingPhotos.json'

// Pick one pooled photo for a query. Deterministic when `seed` is given (so a tile
// doesn't reshuffle on every re-render); random per call otherwise. Falls back to a
// local placeholder src if the query isn't pooled yet.
export function pickLandingPhoto(query, fallbackSrc, seed) {
  const list = pool[query]
  if (Array.isArray(list) && list.length) {
    const i = Number.isInteger(seed)
      ? seed % list.length
      : Math.floor(Math.random() * list.length)
    const p = list[i]
    return { src: p.url, author: p.author, author_url: p.author_url, dynamic: true }
  }
  return { src: fallbackSrc, author: null, author_url: null, dynamic: false }
}

export function hasLandingPool() {
  return Object.values(pool).some(a => Array.isArray(a) && a.length)
}
