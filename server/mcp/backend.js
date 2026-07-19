// Backend bridge for the MCP server. Every call is made with the CALLER'S
// Supabase access token, so Postgres RLS scopes data to that user automatically —
// a token grants access only to its owner's trips.

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY

if (!URL || !ANON) {
  console.error('[mcp] SUPABASE_URL and SUPABASE_ANON_KEY are required.')
  process.exit(1)
}

// Verify a bearer token against Supabase Auth → { id, scopes:Set }. Read scope is
// always present; 'write' is granted explicitly via the user's app_metadata
// (mcp_scope), so mutating tools stay behind an elevated scope the user opts into.
// A dev bypass (MCP_DEV_USER, non-production only) enables local smoke tests.
export async function verifyToken(token) {
  if (process.env.NODE_ENV !== 'production' && process.env.MCP_DEV_USER) {
    return { id: process.env.MCP_DEV_USER, scopes: new Set(['read', 'write']), token: token || 'dev' }
  }
  if (!token) return null
  try {
    const r = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    const u = await r.json()
    if (!u?.id) return null
    const raw = u.app_metadata?.mcp_scope ?? u.user_metadata?.mcp_scope
    const granted = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/).filter(Boolean) : []
    return { id: u.id, scopes: new Set(['read', ...granted]), token }
  } catch { return null }
}

async function rest(method, token, path, { body, prefer } = {}) {
  const r = await fetch(`${URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, data }
}
export const restGet = (token, path) => rest('GET', token, path)
export const restPost = (token, path, body, prefer) => rest('POST', token, path, { body, prefer })
export const restPatch = (token, path, body) => rest('PATCH', token, path, { body, prefer: 'return=representation' })

// Call a Supabase Edge Function with the caller's token (the function's own JWT
// guard + rate-limit still apply).
export async function invokeFn(token, name, body) {
  const r = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, data }
}

// Write a trace row (redacted) as the user. Best-effort — never breaks a call.
export async function trace(token, row) {
  try { await restPost(token, '/agent_tool_calls', row, 'return=minimal') } catch { /* ignore */ }
}
