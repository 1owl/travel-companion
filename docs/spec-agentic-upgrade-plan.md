# Agentic Travel Agent — Upgrade Plan

_For review before any changes are committed. Prepared 2026-07-27 from a full
codebase deep-dive + market research. Nothing here is built until you approve a
phase. Each phase ends at a gate (`npm run verify` + manual happy-path), per
`CLAUDE.md` standing rules._

---

## 1. Where the app actually is today (deep-dive findings)

### 1.1 What exists and works
The app is much further along than "generic planner":

- **Solid planner core** — trips, booking ledger, multi-currency budget engine,
  live itinerary, Google-Places-grounded AI planner, confirmation-email/PDF
  extraction (incl. vision OCR), Duffel flight search, stays search w/ fallback,
  3D Discover globe + Trip Adviser.
- **Agentic layer Phases 1–3 are already built** (commits `4ab86b5` → `2c03634`):
  - 14 tools with shared Zod contracts (`src/agent/tools/`, `src/agent/contracts/schemas.js`)
  - L1–L4 autonomy model (`src/agent/autonomy.js`), approval-gate logic, PII
    redaction, trace logging to `agent_tool_calls` (RLS table exists in `schema.sql`)
  - `traveller_preferences` table + `set_traveller_preferences` tool
  - Financial tools (`hold_offer`, `create_booking`, `cancel_booking`) against
    **Duffel TEST orders only**, with stale-offer revalidation (`get_offer`)
  - Phase 2: CopilotKit bridge + generative UI (`AgentDock`, `ApprovalGate`,
    `AgentPlan`, `AgentTrace`, `AgentFilledForm`), behind `VITE_FEATURE_AGENT`
  - Phase 3: remote MCP server (`server/mcp/`) — verified booting, listing 11
    tools to a real MCP client

### 1.2 What's built but NOT live
- The CopilotKit Node runtime (`server/agent-runtime/`) boots locally but is
  **not deployed**; the live model loop ("four days in Lyon" acceptance) has
  never run. `VITE_FEATURE_AGENT` is off in production.
- The MCP server is not deployed over HTTPS; no in-app "connect MCP client" flow.
- `parse-confirmation` vision path needs a redeploy (§9 of PROJECT-STATUS).
- Duffel is TEST-mode; Duffel Stays not enabled on the token.

### 1.3 Structural gaps vs. an agentic travel *agent*
- **No proactivity.** The agent only answers when spoken to. No scheduled jobs,
  no price watching, no alerts, no notifications.
- **No real money path** (by design today) — no live orders, no payments.
- **No in-trip mode.** Nothing changes when the trip starts: no flight status,
  no check-in reminders, no disruption handling, no day-of replanning.
- **No collaboration.** Single-user; no shared trips, group chat, or multi-origin
  group planning.
- **No memory beyond preferences.** No traveller profile (loyalty numbers,
  passports handled out-of-band), no cross-trip learning.
- **FX is static** placeholder rates in `src/lib/currency.js`.
- **No agent-native distribution polish**: MCP auth is bearer-token-only
  (no OAuth 2.1 flow), no WebMCP, no UCP alignment.

---

## 2. Market research synthesis (July 2026)

### 2.1 The landscape

| Player | What they have | What they lack |
|---|---|---|
| **Google AI Mode** | Agentic booking in Search, partners: Booking, Expedia, Marriott, IHG, Choice, Wyndham. Owns the top of funnel. | Not a trip manager; no persistent ledger/budget; relationship stays with Google, not the traveller. |
| **Mindtrip** | Best-in-class visual planning + **in-chat flight checkout** (Sabre Mosaic + PayPal, launched May 2026); 11M+ POIs; Thatch curator content. | Modifications must be done with the third-party provider; weak multi-city judgment; no post-booking ownership. |
| **Layla** | Strong end-to-end itineraries, live pricing, **PriceLock** 24/7 fare tracking; 1.1M+ trips planned. | Modifications handed off; chat-first, thin trip-management layer. |
| **Booking.com / Expedia (Romie)** | Own inventory → real booking + in-ecosystem modifications; AI Property Compare, Activity Planner, Trip Matching from Reels. | Locked to their inventory; not itinerary/ledger-centric; no cross-provider view. |
| **Hopper** | Price prediction, price freeze, cancel-for-any-reason fintech (~65% of revenue). | Weak conversational planning; no agentic itinerary ownership. |
| **Sabre / Amadeus** | Agentic-ready APIs + MCP servers (Sabre, Sept 2025); UCP/AP2 commerce protocols emerging. | Infrastructure, not consumer products — *this is the supply side we can ride*. |
| **Navan** | Corporate: policy-aware booking, rebooking, servicing. | Not leisure. |
| **GuideGeek / Wanderlog / Wonderplan etc.** | Messaging distribution / collaboration / budgets. | No real booking execution. |
| **Zenvoya** | Claims full lifecycle incl. in-app modifications. | New, small, unproven — but proves the market gap is real. |

### 2.2 The five unresolved gaps (verified across reviews & tests)

1. **Full-lifecycle ownership.** Nobody consumer-side reliably does
   discover → plan → **book → modify/cancel → in-trip → post-trip** in one
   place. Modifications/cancellations are the rarest capability in the category.
2. **Proactivity.** The best-tested agents win by acting *unprompted*: visa
   requirements, eSIM, connection-risk warnings, fare drops, disruption
   rebooking. Most tools are reactive chat boxes.
3. **Group travel.** Multi-origin, multi-budget group coordination is the
   widely-acknowledged hard, unsolved problem.
4. **Trust at the moment of spend.** Expedia's "AI Trust Gap" research:
   travellers like AI planning but only commit through brands they trust.
   Grounded prices, approval gates, and full audit trails are the antidote —
   *which this app's architecture already encodes as invariants.*
5. **In-trip disruption.** Airlines do this internally; consumer planners don't.
   An agent that notices your delay and re-plans your day is still essentially
   absent from consumer apps.

### 2.3 Strategic implication

Competing on *planning quality* is a losing game — Google, Mindtrip, and Layla
have more data and distribution. The winnable position is:

> **The agent that owns your trip after you book it** — persistent ledger,
> budget, watchfulness (price/disruption), safe autonomous action with approval
> gates, and agent-native access (MCP) so the trip lives wherever the user is.

This app is already architecturally closest to that position: ledger + budget +
confirmation ingestion + tool contracts + autonomy + approval gates + MCP are
built. The market is racing toward exactly the infra (Sabre/Amadeus agentic
APIs, UCP) that this stack (Duffel + MCP) already mirrors.

---

## 3. Upgrade strategy — four pillars

**P1 — Ship the agent.** Deploy what's built; make the CopilotKit sidebar the
primary interface for trip work. (Phase A)

**P2 — Watchfulness (the differentiator).** Scheduled watchdog agents: fare
tracking, offer-expiry warnings, disruption monitoring, check-in/visa/weather
briefings, proactive notifications. Nobody consumer-side does this from the
traveller's own ledger. (Phases B–C)

**P3 — Own the booking lifecycle.** Decide the payments path, then go live:
real orders, in-app modifications, cancellations with refund visibility —
the rarest capability in the market. (Phase D)

**P4 — Be agent-native.** Polish MCP auth + connect flow, add WebMCP, track
UCP/AP2 so external agents can plan/manage trips here too. (Phase E)

---

## 4. Phased roadmap

### Phase A — Ship the existing agent (1–2 weeks) — LOW RISK
*Goal: the built-but-dark agentic layer goes live.*

1. Deploy `server/agent-runtime/` on the VPS behind TLS (recipe already in its
   README), set `VITE_FEATURE_AGENT=true` + runtime URL, rebuild + deploy Pages.
2. Run the "four days in Lyon" acceptance end-to-end; tune tool descriptions
   from trace data in `agent_tool_calls`.
3. Deploy `server/mcp/` over HTTPS; add the in-app "connect an MCP client"
   token flow (follow-up already noted in `server/mcp/README.md`).
4. Redeploy `parse-confirmation` (unlocks vision OCR for scanned PDFs — known
   pending action).
5. Replace placeholder FX with a live feed (e.g. open/free FX API, cached
   daily in Supabase) behind the existing `currency.js` `toBase()` interface.
6. Autonomy level selector in trip settings (L1–L4 exists in code, no UI).

**Gate:** agent books a Duffel TEST order end-to-end in prod with approval
gate; MCP client connects and edits a trip; verify green.

### Phase B — Watchdog: price + offer monitoring (2–3 weeks) — MEDIUM
*Goal: the app acts first, without being asked.*

1. New tables: `watch_rules` (trip_id, kind, target, threshold, cadence, RLS)
   + `agent_notifications` (kind, payload, read_at, RLS).
2. Nightly scheduler (Supabase pg_cron → Edge Function): re-price saved
   `price_quotes` and active searches; fare-drop events → notification +
   optional auto-hold (L3+ only, still gated).
3. Offer-expiry warnings for held/saved offers ("this fare expires in 6 h").
4. Notification surface: in-app inbox first; email via a transactional provider
   (Resend/Postmark) as opt-in. *(Decision D2.)*
5. Agent tools: `create_watch`, `list_watches`, `dismiss_notification` —
   registered in `src/agent/tools/index.js`, so the user can say "watch this
   route under $900".

**Gate:** create a watch on a real route; observe a price-change notification
from the scheduler with no user session open.

### Phase C — In-trip companion mode (3–4 weeks) — MEDIUM-HIGH
*Goal: the app knows when the trip starts and works the trip, not the plan.*

1. Flight status integration (Duffel order sync where orders exist;
   FlightAware/AeroAPI or aviationstack for confirmation-number-only bookings
   from the ledger). Delay/cancel → proactive notification + one-tap replan.
2. Day-of briefings: pre-departure pack (weather, FX, check-in links, entry
   requirements via Sherpa/Passport Index API, transit to airport), generated
   by the agent 48 h / 3 h before events.
3. "Today" view: the trip page switches to a live day timeline during trip
   dates; itinerary gaps flagged (unbooked connections, missing transfers —
   builds on `HowToGetThere.jsx` + `journeys.js`).
4. Disruption playbook: delay detected → agent searches alternatives
   (`search_flights`/`search_journeys`) → proposes re-plan through AgentPlan →
   executes on approval. *(This is the market's #5 gap — almost nobody has it.)*

**Gate:** simulated delay on a test trip produces a proactive notification +
an executable replan plan within N minutes.

### Phase D — Real booking lifecycle (4–6+ weeks) — HIGH / DECISION-GATED
*Goal: real orders, in-app modifications, cancellations — the rarest capability.*

1. **Decision D1 (the big one, from the Phase-1 spec Q2):**
   - (a) Duffel live + Duffel Payments/Stripe — real PCI scope, passenger data,
     refunds. Largest effort, true differentiation.
   - (b) Partner/affiliate handoff (deep-link to provider checkout) — fast,
     zero PCI, monetisable, but modifications stay off-app (Mindtrip/Layla's
     ceiling).
   - (c) Hybrid (recommended): live Duffel orders for flights where Duffel
     supports servicing; affiliate handoff for stays/activities. Gets
     in-app modify/cancel for flights without full OTA scope.
2. Passenger profiles (names/DOB; passports/payment via provider vault only —
   never our DB; redaction rules already in `redact.js`).
3. Order sync: Duffel order changes → ledger status updates; refund tracking
   on `cancel_booking`.
4. Post-trip wrap: spend report, receipts vault, "next time" preferences
   learned into `traveller_preferences`.

**Gate:** real (or live-sandbox) order → modify → cancel round-trip with
correct ledger/budget/refund state throughout.

### Phase E — Agent-native distribution + collaboration (3–4 weeks) — MEDIUM
1. MCP: OAuth 2.1 flow, per-scope grants UI, publish tool manifest stability.
2. WebMCP exposure of read tools (spec already anticipates transport).
3. Shared trips: `trip_members` table + RLS, invite flow, activity feed;
   group budget split (extends BudgetEngine); multi-origin flight search
   (search N origins → one destination, reconcile).
4. Track UCP/AP2 — adopt when supplier-side support (Sabre/Amadeus) is real.

**Gate:** two users co-edit one trip; Claude Desktop manages the trip via
OAuth'd MCP.

### Phase F — Monetisation + growth layer (parallel, from Phase B on)
- Free: planning, ledger, budget, agent chat (rate-limited, existing caps).
- Pro (~A$49/yr, matching Layla/Wanderlog price points): watchers, in-trip
  mode, notifications, MCP access, higher rate limits.
- Affiliate: stays/activities handoff links (Booking/GetYourGuide) — revenue
  without PCI scope.
- Cost guards: per-user daily caps already exist; add watchdog cost ceilings.

---

## 5. Decisions I need from you (blocking)

- **D1 — Payments path** (Phase D): hybrid recommended (live Duffel flight
  orders + affiliate elsewhere). Full in-app payment is its own initiative.
- **D2 — Notifications**: in-app only vs. +email (needs a provider + cost) vs.
  +push (PWA). Email recommended for watchdog value.
- **D3 — Hosting**: the two Node services (agent-runtime, MCP) live on the
  existing Hostinger VPS (fine) — or move to managed (Fly.io/Render) for
  reliability once real users hit them.
- **D4 — Priority**: Phases are ordered by differentiating value ÷ risk, but
  if you want revenue sooner, Phase F's affiliate layer can start in Phase A.
- **D5 — Duffel Stays**: enable Stays on the Duffel account (live nightly
  prices) or keep the Google+Booking fallback?

## 6. Risks

- **CopilotKit dependency** — it's the runtime for the in-app agent; evaluate
  against a thin custom loop (Anthropic tool-use) if its DX/telemetry becomes a
  constraint. The tool contracts are runtime-agnostic, so swapping is cheap.
- **Cost burn from watchers** — scheduled re-pricing multiplies Duffel/Claude
  calls; needs per-user watch limits + cache-first design from day one.
- **Flight-status data quality** — third-party status APIs lag airline data;
  always label freshness (consistent with the never-invent invariant).
- **Regulatory** — if Phase D(a/c) ships, IATA/agency obligations and refund
  liability become real; keep Duffel as merchant-of-record where possible.
- **Scope discipline** — Google/Booking will always out-inventory us. Do not
  chase planning features beyond parity; invest only in the four pillars.

## 7. Success metrics (per phase gate)

- Agent task success rate (trace table): >90% tool calls succeed or recover
  with a structured hint.
- Approval-gate decline rate <30% (measures proposal quality).
- Watcher precision: % fare-drop notifications the user acts on.
- Time-to-replan on disruption < 5 min from detection to approved plan.
- Booking-success-at-speed: % bookings committed inside offer validity window.
- Cost per active trip per month < revenue/affiliate target.
