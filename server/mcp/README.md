# Remote MCP server

Exposes Travel Companion's tools to MCP clients (Claude Desktop, Claude Code,
other MCP hosts) over **streamable HTTP at `/mcp`**, so an external agent can plan
and edit a trip server-to-server — no DOM scraping.

## Model
- **One contract, another transport.** The Zod schemas are imported straight from
  the app (`src/agent/contracts/schemas.js`); execution is server-side here
  against Supabase + the Edge Functions using the caller's token.
- **Per-user via a Supabase bearer token.** RLS scopes every read/write to the
  token's owner — a token only ever touches that user's trips.
- **Scopes.** Read tools at default scope; write tools (`create_trip`,
  `add_itinerary_item`, `update_itinerary_item`, `set_traveller_preferences`)
  require the `write` scope, granted explicitly via the user's `app_metadata.mcp_scope`.
- **Financial tools are NOT exposed** (`create_booking`/`cancel_booking`/`hold_offer`)
  — remote spend isn't trusted in v1.
- **Rate-limited per token** and **every call logged** to `agent_tool_calls` (redacted).

## Run locally
```bash
cd server/mcp && npm install
SUPABASE_URL=… SUPABASE_ANON_KEY=… npm start          # → http://localhost:4142/mcp
# local smoke test only: add MCP_DEV_USER=<uuid> to bypass auth
```

## Connect a client
Clients send `Authorization: Bearer <supabase access token>`. Example Claude
Desktop / Claude Code config (once deployed over HTTPS):
```json
{ "mcpServers": {
    "travel-companion": {
      "url": "https://<vps>/mcp",
      "headers": { "Authorization": "Bearer <your supabase access token>" }
    } } }
```
Get a token by signing into the app and copying the session access token (a proper
in-app "connect this MCP client" flow is the next iteration).

## Deploy (VPS, behind TLS)
Copy `server/mcp/`, `npm install --omit=dev`, set `.env`, run under pm2/systemd,
expose `/mcp` over HTTPS via Traefik/nginx.

## Verified
Boots; `/health` 200; a real MCP client connects, lists 11 tools (financial
excluded), receives correct JSON schemas, and gets a structured VALIDATION_FAILED
on bad input. Live tool execution needs a real user token + the Edge Functions
deployed; the Claude Desktop acceptance runs once it's live over HTTPS.

## Follow-ups
- Full OAuth 2.1 discovery/flow (v1 accepts a Supabase bearer token directly).
- In-app "grant this token write scope / connect MCP client" UI.
