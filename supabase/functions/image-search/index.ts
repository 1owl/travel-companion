// Place-aware photo search via Unsplash. Powers trip covers + the trip-detail
// banner and the landing gallery ("fresh each visit"). Uses the relevance-ranked
// /search endpoint (the /random endpoint returned loosely-related shots), then
// shuffles the top results so each visit differs while staying on-topic.
// Wrapped per the playbook: timeout, one retry, graceful empty result on failure —
// the client then falls back to a local placeholder, so never a broken image.
// Secret: UNSPLASH_ACCESS_KEY.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
// Unsplash attribution guideline: link back with UTM params (app name).
const UTM = 'utm_source=travel_companion&utm_medium=referral'

import { guard } from '../_shared/guard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const blocked = await guard(req, 'image-search', 30, 300); if (blocked) return blocked

  const key = Deno.env.get('UNSPLASH_ACCESS_KEY')
  if (!key) return json({ error: 'Image search not configured (missing Unsplash key).' }, 503)

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  // Fire-and-forget download tracking (Unsplash ToS) — best effort, never blocks.
  // Only attach the secret key when the tracking URL is genuinely Unsplash's own
  // host. Without this check a caller could pass any URL and the server would send
  // `Authorization: Client-ID <UNSPLASH_ACCESS_KEY>` to it — key exfiltration + SSRF.
  // Unsplash download_location URLs always live on api.unsplash.com, so this is lossless.
  if (typeof body.track === 'string' && body.track) {
    let host = ''
    try { host = new URL(body.track).host } catch { /* invalid URL → skip */ }
    if (host === 'api.unsplash.com') {
      try { await fetchWithTimeout(body.track, { headers: { Authorization: `Client-ID ${key}` } }, 6000) } catch { /* ignore */ }
    }
    return json({ ok: true }, 200)
  }

  const query = String(body.query || '').trim()
  if (!query) return json({ source: 'unsplash', results: [] }, 200)
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 12)
  const orientation = ['landscape', 'portrait', 'squarish'].includes(String(body.orientation))
    ? String(body.orientation) : 'landscape'

  // Pull a pool of the most relevant photos, then randomly pick `count` from it so
  // results stay on-topic but vary between visits.
  const perPage = Math.min(Math.max(count * 5, 12), 30)
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}`
    + `&per_page=${perPage}&orientation=${orientation}&content_filter=high&order_by=relevant`

  let data: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchWithTimeout(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } }, 8000)
      if (!r.ok) { if (attempt === 0) continue; return json({ source: 'unsplash', results: [], error: `Unsplash ${r.status}` }, 200) }
      data = await r.json()
      break
    } catch {
      if (attempt === 0) continue
      return json({ source: 'unsplash', results: [], error: 'timeout' }, 200)
    }
  }

  const pool = (data as { results?: unknown[] })?.results
  const photos = Array.isArray(pool) ? [...pool] : []
  shuffle(photos)

  const results = photos.slice(0, count).map((p: any) => ({
    id: p.id,
    url: p.urls?.regular,
    full: p.urls?.full,
    thumb: p.urls?.small,
    alt: p.alt_description || p.description || query,
    author: p.user?.name || null,
    author_url: p.user?.links?.html ? `${p.user.links.html}?${UTM}` : null,
    download_location: p.links?.download_location || null,
  })).filter((x: { url?: string }) => x.url)

  return json({ source: 'unsplash', fetched_at: new Date().toISOString(), query, results }, 200)
})

function shuffle(a: unknown[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]
  }
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
