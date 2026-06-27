// Launch-hardening guard for paid Edge Functions. One call to the atomic
// check_rate_limit() RPC (run as the authenticated caller) does three things:
//   1. rejects anonymous callers  → 401 (before any paid work)
//   2. enforces per-minute + per-day caps → 429 with Retry-After
//   3. logs the call for the user
// Returns a Response to send back when blocked, or null to proceed.
// Fails OPEN on infra hiccups / before the RPC exists, so a transient DB issue
// never hard-bricks the app — but anonymous + over-limit are enforced once the
// schema (api_usage + check_rate_limit) is applied.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export async function guard(req: Request, fn: string, perMinute = 6, perDay = 40): Promise<Response | null> {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) return deny(401, 'Please sign in to use this feature.')

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) return null // platform misconfig — don't hard-block users

  try {
    const r = await fetchWithTimeout(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_fn: fn, p_per_minute: perMinute, p_per_day: perDay }),
    }, 6000)
    if (r.status === 401) return deny(401, 'Please sign in to use this feature.')
    if (!r.ok) return null // RPC not yet deployed / infra hiccup → fail open
    const d = await r.json()
    if (d?.allowed) return null
    if (d?.reason === 'unauthenticated') return deny(401, 'Please sign in to use this feature.')
    const retry = Number(d?.retry_after) || 60
    const msg = d?.reason === 'daily'
      ? 'Daily limit reached for this feature — please try again tomorrow.'
      : 'You’re going a little fast — wait a moment and try again.'
    return deny(429, msg, retry)
  } catch {
    return null // never block on a guard error
  }
}

function deny(status: number, error: string, retryAfter?: number) {
  const headers: Record<string, string> = { ...CORS, 'Content-Type': 'application/json' }
  if (retryAfter) headers['Retry-After'] = String(retryAfter)
  return new Response(JSON.stringify({ error }), { status, headers })
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
