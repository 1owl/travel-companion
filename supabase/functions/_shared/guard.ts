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

// `failClosed` controls what happens when the rate-limit RPC is unavailable
// (misconfig, not-yet-deployed, infra hiccup, timeout). Cheap/free functions
// (image-search) leave it false and fail OPEN so a transient issue doesn't brick
// them. Functions that spend real money per call (Anthropic/Duffel/Google) pass
// true and fail CLOSED, so a downed limiter can't be used to run uncapped paid work.
export async function guard(
  req: Request, fn: string, perMinute = 6, perDay = 40, failClosed = false,
): Promise<Response | null> {
  const auth = req.headers.get('Authorization') || ''
  if (!auth) return deny(401, 'Please sign in to use this feature.')

  // When the limiter can't run, fail-closed functions return 503; fail-open return null.
  const unavailable = () => failClosed
    ? deny(503, 'This feature is temporarily unavailable. Please try again shortly.', 30)
    : null

  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) return unavailable() // platform misconfig

  try {
    const r = await fetchWithTimeout(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_fn: fn, p_per_minute: perMinute, p_per_day: perDay }),
    }, 6000)
    if (r.status === 401) return deny(401, 'Please sign in to use this feature.')
    if (!r.ok) return unavailable() // RPC not yet deployed / infra hiccup
    const d = await r.json()
    if (d?.allowed) return null
    if (d?.reason === 'unauthenticated') return deny(401, 'Please sign in to use this feature.')
    const retry = Number(d?.retry_after) || 60
    const msg = d?.reason === 'daily'
      ? 'Daily limit reached for this feature — please try again tomorrow.'
      : 'You’re going a little fast — wait a moment and try again.'
    return deny(429, msg, retry)
  } catch {
    return unavailable() // timeout / network error
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
