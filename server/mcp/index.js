// Travel Companion — remote MCP server.
// Exposes the app's tools to MCP clients (Claude Desktop/Code) over streamable
// HTTP at /mcp. Per-user via a Supabase bearer token (RLS scopes all data to the
// owner). Read tools at default scope; write tools require the 'write' scope the
// user grants explicitly. Financial tools are NOT exposed (v1). Every call is
// rate-limited per token and logged to the same agent_tool_calls store.
//
// Run:  SUPABASE_URL=… SUPABASE_ANON_KEY=… node index.js
// Auth: clients send Authorization: Bearer <supabase access token>.

import express from 'express'
import { z } from 'zod'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS } from './tools.js'
import { verifyToken, trace } from './backend.js'
import { redact } from '../../src/agent/redact.js'

const PORT = Number(process.env.PORT) || 4142
const PER_MIN = Number(process.env.MCP_RATE_PER_MIN) || 60

// Pre-compute JSON Schema for each tool once (Zod 4 → JSON Schema).
const JSON_SCHEMA = new Map(TOOLS.map(t => [t.name, z.toJSONSchema(t.schema)]))

// ── per-token rate limit (in-memory sliding minute) ───────────────────────────
const hits = new Map()
function rateOk(token) {
  const now = Date.now(), win = 60_000
  const arr = (hits.get(token) || []).filter(t => now - t < win)
  arr.push(now); hits.set(token, arr)
  return arr.length <= PER_MIN
}

const toolResult = (obj, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], isError })
const errResult = (code, message, hint) => toolResult({ error: { code, message, recovery_hint: hint || null } }, true)
const summarize = r => r.error ? { ok: false, code: r.error.code } : { ok: true, count: Array.isArray(r.data?.results) ? r.data.results.length : Array.isArray(r.data?.items) ? r.data.items.length : undefined }

// Build an MCP Server bound to one authenticated session.
function buildServer(session) {
  const server = new Server({ name: 'travel-companion', version: '0.1.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS
      .filter(t => t.scope === 'read' || session.scopes.has('write'))
      .map(t => ({ name: t.name, description: t.description, inputSchema: JSON_SCHEMA.get(t.name) })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find(t => t.name === req.params.name)
    if (!tool) return errResult('NOT_FOUND', `No tool named ${req.params.name}.`)
    if (tool.scope === 'write' && !session.scopes.has('write')) {
      return errResult('AUTONOMY_DENIED', `${tool.name} needs the 'write' scope, which you haven't granted.`, 'Grant write access to this token in the app, then retry.')
    }
    if (!rateOk(session.token)) return errResult('RATE_LIMITED', 'Too many calls this minute.', 'Wait a moment and retry.')

    const parsed = tool.schema.safeParse(req.params.arguments || {})
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
      return errResult('VALIDATION_FAILED', `Invalid parameters — ${issues}`, 'Fix the named fields and retry.')
    }

    const started = Date.now()
    let r
    try { r = await tool.exec(parsed.data, session) } catch (e) { r = { error: { code: 'UPSTREAM_ERROR', message: String(e).slice(0, 160) } } }
    trace(session.token, {
      trip_id: parsed.data.trip_id ?? null, tool: tool.name, transport: 'mcp', autonomy_level: 'mcp',
      input_redacted: redact(parsed.data), output_summary: summarize(r),
      status: r.error ? 'error' : 'ok', error_code: r.error?.code ?? null, latency_ms: Date.now() - started,
    })
    return r.error ? errResult(r.error.code, r.error.message, r.error.recovery_hint) : toolResult(r.data)
  })

  return server
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.get('/health', (_req, res) => res.json({ ok: true, tools: TOOLS.length }))

// Minimal OAuth-protected-resource hint (full OAuth 2.1 discovery is a follow-up;
// v1 accepts a Supabase access token as the bearer).
app.get('/.well-known/oauth-protected-resource', (_req, res) =>
  res.json({ resource: `${req_base(_req)}/mcp`, authorization_servers: [process.env.SUPABASE_URL], bearer_methods_supported: ['header'] }))
function req_base(req) { return `${req.protocol}://${req.get('host')}` }

async function authenticate(req, res) {
  const auth = req.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const session = await verifyToken(token)
  if (!session) {
    res.set('WWW-Authenticate', 'Bearer realm="travel-companion", error="invalid_token"')
    res.status(401).json({ error: 'Sign in: send a valid Supabase access token as Bearer.' })
    return null
  }
  return session
}

// Streamable HTTP, stateless (a fresh server per request — simple + safe here).
app.post('/mcp', async (req, res) => {
  const session = await authenticate(req, res)
  if (!session) return
  const server = buildServer(session)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => { transport.close(); server.close() })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e).slice(0, 160) })
  }
})
// Stateless: no server-streamed sessions to GET or DELETE.
app.get('/mcp', (_req, res) => res.status(405).json({ error: 'Method not allowed (stateless).' }))
app.delete('/mcp', (_req, res) => res.status(405).json({ error: 'Method not allowed (stateless).' }))

app.listen(PORT, () => console.log(`[mcp] listening on :${PORT}  /mcp  (${TOOLS.length} tools, ${PER_MIN}/min per token)`))
