# Agent Go-Live Runbook — Phase A

_Status updated 2026-07-28 during execution. Steps 1–2 and most of 3–4 are
DONE. Remaining: one secret value (Anthropic key on the VPS), two GitHub
secrets, a push, and the acceptance run._

---

## ✅ 1. Schema addition — DONE
Applied via `supabase/migrations/20260728000000_trips_autonomy_level.sql`
(`supabase db push`). Verified: `trips.autonomy_level` returns HTTP 200 via
PostgREST. The CLI is now linked (`supabase link`); future schema changes go
through migration files + `db push`.

## ✅ 2. `parse-confirmation` redeployed — DONE
Vision OCR path is live. Verify in-app: quick-add a scanned/image PDF →
bookings extract.

## ✅ 3. Agent runtime on VPS — DONE (2026-07-28)
- Node 22 installed on the VPS; service at
  `/opt/agent-services/server/agent-runtime`, systemd unit
  `travel-agent-runtime.service` (enabled on boot).
- Traefik route: `https://168.231.119.20/agent/*` → `127.0.0.1:4141`
  (prefix stripped), `/opt/traefik/dynamic/travelagent.yml`.
- Anthropic key recovered from root's bash history on the VPS and installed
  server-side into `.env` (never printed/stored elsewhere).
- Verified: local health 200, Traefik health 200, public
  `https://168.231.119.20/agent/health` 200. Boot takes ~30 s (heavy imports).

## 🟡 4. MCP server on VPS — deployed, final verification pending
- `/opt/agent-services/server/mcp`, systemd unit `travel-mcp.service`
  (enabled, was `active` before the VPS SSH throttle cut the session).
- Traefik route: `https://168.231.119.20/mcp` → `127.0.0.1:4142` (no strip —
  the server serves `/mcp` natively).
- Layout note: the VPS mirrors the repo (`server/mcp` + `src/` siblings under
  `/opt/agent-services`) because the server imports the app's shared Zod
  contracts; `/opt/agent-services/node_modules` symlinks to
  `server/mcp/node_modules` so `src/` imports resolve.
- Verify once SSH is back:
  ```bash
  curl -sk https://168.231.119.20/mcp -X POST \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
  # expect: {"error":"Sign in: send a valid Supabase access token as Bearer."}
  ```
  Then connect Claude Desktop with a Supabase bearer token (see
  `server/mcp/README.md`) and confirm it lists 11 tools.

## ✅ 5. Agent flag in the production build — DONE (2026-07-29)
GitHub secrets `VITE_FEATURE_AGENT=true` + `VITE_COPILOT_RUNTIME_URL` added;
workflow re-ran. Verified in the deployed bundle: main JS references the
runtime URL + copilotkit, and the `AutonomySelector-*.js` lazy chunk shipped.
CORS preflight from `https://1owl.github.io` → 204 with
`Access-Control-Allow-Origin: https://1owl.github.io`.

## 6. Live acceptance — "four days in Lyon" (final step, in the browser)
Ask the assistant on a real trip: *"Plan four days in Lyon in October,
mid-range, trains not flights."* Expect proposals → approval gate at L1 →
approved items in the Booking ledger → `agent_tool_calls` rows with
`status = ok` (redacted) in Supabase.

---

## Rollback
Delete the two GitHub secrets (or set `VITE_FEATURE_AGENT` to anything but
`true`) and redeploy — the CopilotKit branch is dead-code-eliminated and the
app returns to its previous behaviour. The VPS services can stay up harmlessly
(`systemctl stop travel-agent-runtime travel-mcp` to be tidy).

## Ops cheat-sheet (VPS)
```bash
systemctl status travel-agent-runtime travel-mcp
journalctl -u travel-mcp -f
# Update code: scp new files into /opt/agent-services/server/<svc>, then
systemctl restart travel-agent-runtime travel-mcp
```
