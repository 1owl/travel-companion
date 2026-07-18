// Pre-fetch a POOL of Unsplash photos for the PUBLIC landing page.
//
// Why: the landing is public, but image-search is a paid function that (per the
// launch-hardening invariant) must reject anonymous callers with 401. Rather than
// weaken that, we fetch a pool ONCE — signed in as the demo/test user — into a
// committed manifest. The landing then shuffles from the manifest client-side, so
// it still looks fresh every visit with zero anonymous API calls and no quota burn.
//
// Compliance: fires Unsplash's download_location once per selected photo (their
// ToS "trigger a download when the photo is used"), through the same function.
//
// Re-run any time to refresh the pool:
//   E2E_EMAIL=… E2E_PASSWORD=… npm run photos:landing
//
// Creds come from the environment (the gitignored .env / shell), never the repo.

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function readEnvFile() {
  try {
    return Object.fromEntries(
      fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
        .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }),
    )
  } catch { return {} }
}

const env = readEnvFile()
const URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const EMAIL = process.env.E2E_EMAIL || env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD || env.E2E_PASSWORD

if (!URL || !ANON) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env'); process.exit(1) }
if (!EMAIL || !PASSWORD) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (the demo/test account) to fetch photos — creds are never stored in the repo.')
  process.exit(1)
}

// The landing's queries: the destination gallery pool + the CTA banner.
// Keep these in sync with DESTINATIONS in src/pages/Landing.jsx.
const QUERIES = [
  'Santorini Greece', 'Kyoto Japan', 'Amalfi Coast Italy', 'Banff Canada mountains',
  'Marrakesh Morocco', 'Saint Tropez France', 'Maldives beach', 'Lisbon Portugal',
  'Queenstown New Zealand', 'Iceland landscape', 'travel landscape scenic',
]
const PER = 6                     // photos pooled per query
const SPACING_MS = 2200           // stay under image-search's 30/min cap

const sleep = ms => new Promise(r => setTimeout(r, ms))
let jwt = ''

async function callFn(body) {
  return fetch(`${URL}/functions/v1/image-search`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function signIn() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const d = await r.json().catch(() => ({}))
  if (!d.access_token) { console.error('Sign-in failed:', JSON.stringify(d).slice(0, 200)); process.exit(1) }
  return d.access_token
}

jwt = await signIn()
console.log('signed in as', EMAIL)

// Phase 1 — all searches first, lightly spaced. Kept well under the 30/min cap
// so EVERY query gets its pool (interleaving the tracking calls previously starved
// the tail queries into 429s).
// Start from the existing manifest so a query that gets rate-limited this run
// keeps whatever pool it already had, instead of being dropped.
const outPath = path.join(root, 'src/lib/landingPhotos.json')
let manifest = {}
try { manifest = JSON.parse(fs.readFileSync(outPath, 'utf8')) } catch { manifest = {} }

const toTrack = []
for (const query of QUERIES) {
  const r = await callFn({ query, count: PER })
  if (!r.ok) { console.error(`  ${query} -> HTTP ${r.status} (keeping existing ${manifest[query]?.length || 0})`); await sleep(700); continue }
  const d = await r.json().catch(() => ({}))
  const results = Array.isArray(d.results) ? d.results : []
  if (!results.length) { console.error(`  ${query} -> 0 (keeping existing ${manifest[query]?.length || 0})`); await sleep(700); continue }
  manifest[query] = results.map(p => ({
    url: p.url, thumb: p.thumb, alt: p.alt, author: p.author, author_url: p.author_url,
  }))
  for (const p of results) if (p.download_location) toTrack.push(p.download_location)
  console.log(`  ${query}: ${results.length}`)
  await sleep(700)
}

const total = Object.values(manifest).reduce((n, a) => n + a.length, 0)
if (total === 0) { console.error('No photos fetched — leaving the existing manifest untouched.'); process.exit(1) }

// Write the manifest now, so a throttled/failed tracking phase can't lose the pool.
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 1) + '\n')
console.log(`wrote ${outPath} (${total} photos across ${Object.keys(manifest).length} queries)`)

// Phase 2 — Unsplash ToS: register each selected photo as used. Best-effort and
// throttled; 429s here don't matter, the pool is already saved.
console.log(`tracking ${toTrack.length} photos (best-effort)…`)
for (const loc of toTrack) {
  try { await callFn({ track: loc }) } catch { /* ignore */ }
  await sleep(SPACING_MS)
}
console.log('done')
