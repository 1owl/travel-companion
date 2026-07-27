# Agent Go-Live Runbook — Phase A

_Step-by-step to take the built-but-dark agentic layer live. Code-side Phase A
work (live FX, per-trip autonomy selector, schema column) is committed; the
steps below need credentials that only exist on your machine/accounts, so they
are deliberate user actions. Do them in order; each has a verification step._

**Prereq:** `npm run verify` green locally (lint + unit + e2e).

---

## 1. Apply the schema addition (Supabase SQL editor)

Supabase → SQL Editor → run the new block at the top of the "Agentic layer"
section of `supabase/schema.sql` (or paste the whole file — it is idempotent):

```sql
alter table public.trips add column if not exists autonomy_level text not null default 'L1';
-- + trips_autonomy_level_check constraint (see schema.sql)
```

**Verify:** `select autonomy_level from public.trips limit 1;` returns `L1`.

## 2. Redeploy `parse-confirmation` (unlocks vision OCR)

```bash
npx.cmd supabase functions deploy parse-confirmation --project-ref upvdcmjyyewgdvjcizbt
```

**Verify:** quick-add a scanned/image PDF in the app → bookings extract (was the
known pending action in PROJECT-STATUS §9).

## 3. Deploy the agent runtime on the VPS (`server/agent-runtime/`)

Holds `ANTHROPIC_API_KEY`; serves `POST /api/copilotkit` to the browser app.

1. Copy `server/agent-runtime/` to the VPS; `npm install --omit=dev`.
2. `.env` (from `.env.example`): real `ANTHROPIC_API_KEY`,
   `ALLOWED_ORIGIN=https://1owl.github.io`, `PORT=4141`.
3. Run under pm2/systemd (`pm2 start index.js --name agent-runtime`).
4. Route HTTPS `https://168.231.119.20/agent/*` → `localhost:4141` via the
   existing Traefik/nginx (strip the `/agent` prefix or set
   `COPILOT_ENDPOINT=/agent/api/copilotkit`). Pages is HTTPS → the runtime MUST
   be HTTPS (no mixed content).

**Verify:** `curl https://168.231.119.20/agent/health` → 200
(health makes no model call — safe for uptime probes).

## 4. Deploy the MCP server on the VPS (`server/mcp/`)

1. Copy `server/mcp/`; `npm install --omit=dev`; `.env` with `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `PORT=4142`.
2. `pm2 start index.js --name travel-mcp`.
3. Route HTTPS `https://168.231.119.20/mcp` → `localhost:4142/mcp`.

**Verify:** `curl https://168.231.119.20/mcp/health` → `{"ok":true,"tools":11}`.
Then point Claude Desktop at it with a Supabase bearer token (see
`server/mcp/README.md`) and confirm it lists 11 tools.

## 5. Turn the agent on in the production build

GitHub repo → Settings → Secrets and variables → Actions → add:

| Secret | Value |
|---|---|
| `VITE_FEATURE_AGENT` | `true` |
| `VITE_COPILOT_RUNTIME_URL` | `https://168.231.119.20/agent/api/copilotkit` |

Then add them to the `build` job env in `.github/workflows/deploy.yml`
(two lines beside `VITE_SUPABASE_URL`) and push to `main`. Both are
public-by-design (feature flag + endpoint URL — no secrets).

**Verify:** open a trip on the Pages site → "Travel assistant" sidebar appears,
autonomy selector shows in the topbar.

## 6. Live acceptance — "four days in Lyon"

In the app on a real trip, ask the assistant:
*"Plan four days in Lyon in October, mid-range, trains not flights."*

Expect: itinerary proposal via `search_activities`/`search_journeys` →
`add_itinerary_item` calls pause at the approval gate (L1) → approving writes
ledger rows → rows appear in the Booking ledger tab. Then in
`agent_tool_calls` (Supabase table editor) confirm redacted trace rows with
`status = ok`.

**Gate:** all six steps verified = Phase A live. Phase B (watchdog scheduler)
starts after this holds for a few days of real use.

---

## Rollback

Set `VITE_FEATURE_AGENT` secret to anything but `true` and redeploy — the whole
CopilotKit branch is dead-code-eliminated from the bundle and the app returns
to its current shipped behaviour. The Node services can stay up harmlessly.
