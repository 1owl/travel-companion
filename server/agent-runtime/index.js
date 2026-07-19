// Travel Companion — CopilotKit agent runtime (Node service).
//
// Proxies the in-app agent to Claude. The app's tools are registered on the
// FRONTEND (useCopilotAction in AgentDock), so this service is a thin runtime +
// Anthropic adapter: it holds the ANTHROPIC_API_KEY (never shipped to the
// browser) and orchestrates the model. Point the app's VITE_COPILOT_RUNTIME_URL
// at `<this host>/api/copilotkit`.
//
// Run:  ANTHROPIC_API_KEY=sk-ant-… ALLOWED_ORIGIN=https://1owl.github.io node index.js
// Deploy: on the VPS behind Traefik/nginx with TLS (see README.md).

// Opt out of CopilotKit's anonymous telemetry by default (privacy-preserving;
// override by setting COPILOTKIT_TELEMETRY_DISABLED=false).
process.env.COPILOTKIT_TELEMETRY_DISABLED ??= 'true'

import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import { CopilotRuntime, AnthropicAdapter, copilotRuntimeNodeExpressEndpoint } from '@copilotkit/runtime'

const PORT = Number(process.env.PORT) || 4141
const ENDPOINT = process.env.COPILOT_ENDPOINT || '/api/copilotkit'
const MODEL = process.env.COPILOT_MODEL || 'claude-sonnet-4-6'
const KEY = process.env.ANTHROPIC_API_KEY
// Restrict to the app's origin(s); comma-separated. Falls back to reflecting the
// request origin only in dev (NODE_ENV !== 'production').
const ALLOWED = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean)

if (!KEY) {
  console.error('[agent-runtime] ANTHROPIC_API_KEY is required.')
  process.exit(1)
}

const app = express()
app.use(cors({
  origin: ALLOWED.length ? ALLOWED : (process.env.NODE_ENV === 'production' ? false : true),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['content-type', 'authorization', 'x-copilotkit-runtime-client-gql-version'],
}))

// Health check for load balancers / uptime probes (no model call).
app.get('/health', (_req, res) => res.json({ ok: true, endpoint: ENDPOINT, model: MODEL }))

const anthropic = new Anthropic({ apiKey: KEY })
const serviceAdapter = new AnthropicAdapter({ anthropic, model: MODEL })
const runtime = new CopilotRuntime()

// Mount at root (no Express prefix) so the handler sees the full URL and matches
// ENDPOINT itself — mounting with a prefix strips the path and yields a 404.
const handler = copilotRuntimeNodeExpressEndpoint({ endpoint: ENDPOINT, runtime, serviceAdapter })
app.use(handler)

app.listen(PORT, () => {
  console.log(`[agent-runtime] listening on :${PORT}  endpoint ${ENDPOINT}  model ${MODEL}`)
  console.log(`[agent-runtime] allowed origins: ${ALLOWED.length ? ALLOWED.join(', ') : '(dev: any)'}`)
})
