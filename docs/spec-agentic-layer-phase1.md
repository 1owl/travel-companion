# Agentic Layer — Phase 1 Plan, Tool Manifest & Open Questions

_First deliverable for the agentic-layer initiative. **No implementation code yet** — this is
for review. It maps Phase 1 onto the **actual** repo, gives the complete tool manifest, and
lists the assumptions and blocking questions. Nothing here is built until reviewed._

**Prepared:** 2026-07-18 · against `main` @ Phase A of "How to get there".

---

## 0. Reality check — where the repo actually differs from the prompt

Read this first; it reshapes Phases 1–2. Each item is verified in the codebase.

1. **Design system is "Wanderlust Magazine", not "Quiet Wanderlust".** `CLAUDE.md` records that Wanderlust Magazine *supersedes* Quiet Wanderlust; the source of truth is the CSS custom properties in `src/styles.css` `:root`. I'll build every agent surface on those tokens — I'm flagging the **name** so we're not chasing a system that no longer exists. (No second design vocabulary either way.)

2. **There is no L1–L4 autonomy model in the code.** Grep finds nothing. The prompt says "honour the existing" model — it doesn't exist yet. It's a **prerequisite** for Phase 1 (tools reference "confirmation at L1"). §3-Q1 proposes a concrete definition to adopt; the tool layer is designed to read an autonomy level but the model itself must be agreed first.

3. **The app has NO in-app payment or order-creation path — by explicit design.** `bookingLinks.js`: *"We never process payment in-app — we hand off."* `search-flights`: *"no in-app payment, no PCI scope."* Duffel is used **only for search** (`air/offer_requests`), never `air/orders`. So **`create_booking` is not a wiring job — it is a brand-new capability** (Duffel order creation + payment collection + passenger data) that **directly contradicts the current no-PCI stance** and the launch-hardening invariants. This is the single biggest decision in the whole initiative (§3-Q2). Recommendation below: **exclude real spend from Phase 1**; build the full contract + approval flow against **Duffel test-mode orders only**, no real card capture, until Q2 is resolved.

4. **"Itinerary items" are not a table — the itinerary is derived from `bookings`.** `LiveItinerary` reads `bookings`; AI ideas live in `saved_places`. There is no `itinerary_items` table and no `traveller_preferences` table. So `get_itinerary`/`add_itinerary_item`/`update_itinerary_item` map onto `bookings` (+ `saved_places`), and `set_traveller_preferences` needs a **new** store (§3-Q4).

5. **No Zod in the repo.** Validation today is hand-rolled or via Claude structured outputs. Phase 1 mandates Zod; adopting it is a (small, welcome) new dependency — but it must run in **two runtimes**: browser (Vite) and Supabase Edge Functions (Deno). §1.2 covers the shared-schema strategy.

6. **Duffel is TEST-mode and Duffel Stays is not enabled on the token** (`search-stays` falls back to Google + Booking.com links). So `search_stays`, `hold_offer`, and any stay order are **partially or not** backed today. Flight *search* is the only fully-live Duffel path.

7. **Transports span two runtimes.** The in-app runtime is browser/Node ESM; the trusted handlers (validation, Duffel writes) belong server-side in **Deno** Edge Functions; the future MCP server is another server context. "One tool contract, three transports" therefore hinges on a schema package importable by all three (§1.2) — the central architectural risk of Phase 1.

---

## 1. Phase 1 file-by-file plan (mapped to the real repo)

### 1.1 New directory: `src/agent/`
```
src/agent/
  tools/
    index.js                 # registry: assembles + exports all tools; getTool(name), listTools({transport, scope})
    _types.js                # JSDoc typedefs: Tool, ToolAnnotations, ToolResult, ToolError
    _result.js               # ok(data) / err(code,message,recovery_hint) helpers → structured results
    search-flights.tool.js   # read
    search-stays.tool.js     # read
    get-offer.tool.js        # read (NEW backing)
    list-trips.tool.js       # read
    get-itinerary.tool.js    # read (over bookings)
    search-activities.tool.js# read (over Places/planner)
    get-trip-budget.tool.js  # read (aggregate)
    create-trip.tool.js      # mutate (confirm@L1)
    add-itinerary-item.tool.js
    update-itinerary-item.tool.js
    set-traveller-preferences.tool.js
    hold-offer.tool.js       # financial-ish (NEW, test-mode)
    create-booking.tool.js   # financial (NEW, test-mode only in v1 — see Q2)
    cancel-booking.tool.js   # financial (NEW)
  autonomy.js                # L1–L4 gate: requiresConfirmation(tool, level, context) → bool/reason
  redact.js                  # strips PII from anything entering model context or trace logs
  trace.js                   # writes agent_tool_calls rows (redacted); wraps execute()
  runtime/                   # (Phase 2) AG-UI wiring — empty in Phase 1
```

### 1.2 Shared schemas across runtimes — `packages/tool-contracts/` (or `src/agent/contracts/`)
The **single source of truth** for names + Zod schemas, written as framework-free ESM so it imports cleanly into: (a) the Vite browser bundle, (b) Deno Edge Functions (`import ... from 'npm:zod'` / a URL import), (c) the future MCP server. Each `*.tool.js` imports its schema from here; the Deno handlers import the **same** file to re-validate. Decision needed on physical location (Q7): a real workspace package is cleanest but the repo isn't a monorepo today — a plain `src/agent/contracts/` dir that Deno imports by relative path is the low-friction option.

### 1.3 Where `execute` runs (trust boundary)
- **Read tools** may resolve in the browser via existing libs (`flights.js`, `stays.js`, `journeys.js`, budget math in `currency.js`) — they already call JWT-gated Edge Functions.
- **Mutating + financial tools** MUST resolve in an Edge Function that re-validates with the shared Zod schema and (for offers) re-checks Duffel before any write. New/extended functions:
  - `get-offer` (NEW) — `GET /air/offers/{id}` re-price + availability.
  - `agent-tool` (NEW) — a single guarded dispatch function `{ tool, input, autonomy, trip_id }` → validates → routes to the handler → writes trace. Reuses `_shared/guard.ts` (JWT + rate-limit, fail-closed).
  - Existing `search-flights` / `search-stays` / `search-journeys` are reused as-is by the read tools.

### 1.4 Observability — `supabase/schema.sql` + a dashboard route
- **Migration:** `agent_tool_calls` table — `id, user_id (default auth.uid()), trip_id, tool, transport, autonomy_level, input_redacted jsonb, output_summary jsonb, status, error_code, latency_ms, created_at`. RLS: own rows only. Index `(tool, created_at)`. **No PII** — `redact.js` runs before insert.
- `trace.js` wraps every `execute` to time it and write a row.
- **Dashboard:** `src/pages/AgentMetrics.jsx` behind a dev/admin flag — p95/p99 latency per tool, success rate + failures by `error_code`, booking-success-at-speed (bookings committed inside the offer validity window), approval-gate outcomes, autonomy-level distribution.

### 1.5 Tests (the Phase 1 acceptance gate)
- `src/agent/tools/*.test.js` — drive every tool's `execute` directly with mocked `supabase`/Duffel (repo convention: `vi.mock('./supabase')`).
- `src/agent/agent.e2e.test.js` — **France 2026 round-trip without UI**: `search_flights` (CDG↔… real search, mocked in CI) → `get_offer` (re-price) → `create_booking` against a **mocked Duffel test order** → asserts stale-offer abort path and the structured-error contract.
- Keep `npm run verify` green.

### 1.6 What Phase 1 deliberately does NOT touch
No AG-UI/CopilotKit, no MCP server, no WebMCP (Phases 2–4). No real payment. No new design vocabulary.

---

## 2. Complete tool manifest

Notation: Zod-ish with a natural-language `.describe()` per field (the manifest the model sees). **Backing:** ✅ exists · 🟡 partial · 🆕 new. Annotations use MCP hints (`readOnlyHint`, `destructiveHint`, plus our `financialHint`, `minAutonomyToAutoRun`).

### Read-only (`readOnlyHint: true`, never auto-confirmed away — safe to run)

**`search_flights`** — Backing ✅ (`search-flights`)
> Search bookable flight offers between two places for given dates. Use when the traveller wants to compare or find flights. Returns priced options from Duffel (TEST-mode fares, not bookable) with a fetched_at timestamp; prices are indicative until re-validated with `get_offer`. Cost: one Duffel search (rate-limited).
```
origin:        z.string().min(3).describe("Departure — 3-letter IATA airport code preferred (e.g. 'LHR'), or a city name.")
destination:   z.string().min(3).describe("Arrival — IATA code or city name.")
depart_date:   z.string().regex(ISO_DATE).describe("Outbound date, YYYY-MM-DD.")
return_date:   z.string().regex(ISO_DATE).optional().describe("Return date, YYYY-MM-DD. Omit for one-way.")
adults:        z.number().int().min(1).max(9).default(1).describe("Number of adult passengers.")
cabin:         z.enum(['economy','premium_economy','business','first']).default('economy').describe("Cabin class.")
max_stops:     z.number().int().min(0).max(3).optional().describe("Maximum stops per leg; 0 = direct only.")
```

**`search_stays`** — Backing 🟡 (`search-stays`; Duffel Stays off → Google + Booking.com fallback)
> Find accommodation in a location for a date range. Returns hotels with a nightly/total price when available (Duffel Stays), otherwise a price band + a Booking.com link. Flag results as indicative. Cost: one search.
```
location:      z.string().min(2).describe("City or area, e.g. 'Lyon, France'.")
check_in:      z.string().regex(ISO_DATE).describe("Check-in date, YYYY-MM-DD.")
check_out:     z.string().regex(ISO_DATE).describe("Check-out date, YYYY-MM-DD.")
guests:        z.number().int().min(1).max(8).default(2).describe("Number of guests.")
max_price_per_night: z.number().positive().optional().describe("Ceiling per night, in the trip's base currency.")
```

**`get_offer`** — Backing 🆕 (`get-offer` fn)
> Re-price and re-validate a specific Duffel offer by id, immediately before booking. Returns the current total, currency, expiry, and whether price/availability changed since search. ALWAYS call this before `create_booking`; never book from a search result directly. Cost: one Duffel lookup.
```
offer_id:      z.string().describe("The Duffel offer id from a prior search_flights/search_stays result.")
```

**`list_trips`** — Backing ✅ (trips table)
> List the signed-in user's trips with status and dates. Use to resolve which trip an instruction refers to.
```
status:        z.enum(['planning','booked','past','all']).default('all').optional().describe("Filter by trip status.")
```

**`get_itinerary`** — Backing ✅ (derived from `bookings`)
> Return the full day-by-day itinerary for a trip: every booking and planned item with date, time, status, cost, and links. Use before suggesting additions so you build around what exists.
```
trip_id:       z.string().uuid().describe("The trip's id (from list_trips).")
```

**`search_activities`** — Backing 🟡 (Google Places via `planner`)
> Find real places to do/see/eat in a location (grounded in Google, with rating and a one-line why). Never invents prices or hours. Use for day-planning suggestions.
```
location:      z.string().min(2).describe("City or area, e.g. 'Lyon'.")
date:          z.string().regex(ISO_DATE).optional().describe("Day the activity is for (context only).")
category:      z.enum(['sight','food','activity','all']).default('all').describe("Kind of place.")
```

**`get_trip_budget`** — Backing ✅ (aggregate over `budget_items` + `bookings` via `currency.toBase`)
> Return planned vs. committed vs. remaining for a trip, in its base currency. Use to check headroom before proposing spend.
```
trip_id:       z.string().uuid().describe("The trip's id.")
```

### Mutating, non-financial (`destructiveHint:false`; **confirm at L1**)

**`create_trip`** — Backing ✅ (trips insert)
> Create a new trip. Non-financial. At L1 the user confirms before it's saved.
```
name:            z.string().min(1).describe("Trip name, e.g. 'France 2026'.")
start_date:      z.string().regex(ISO_DATE).optional().describe("Trip start, YYYY-MM-DD.")
end_date:        z.string().regex(ISO_DATE).optional().describe("Trip end, YYYY-MM-DD.")
base_currency:   z.enum(CURRENCIES).default('AUD').describe("Currency all totals roll up into.")
travelers:       z.number().int().min(1).max(20).default(1).describe("Number of travellers.")
```

**`add_itinerary_item`** — Backing ✅ (maps to `bookings` insert; the existing ledger shape)
> Add a planned or booked item to a trip's itinerary (a flight, stay, activity, transfer, note). Non-financial — this records an intention, it does not spend. Confirm at L1.
```
trip_id:       z.string().uuid()
title:         z.string().min(1).describe("Short label, e.g. 'Eurostar London→Paris'.")
category:      z.enum(['Flight','Accommodation','Train','Bus','Ferry','Activity','Other']).describe("Item type.")
date:          z.string().regex(ISO_DATE).optional().describe("Date, YYYY-MM-DD.")
starts_at:     z.string().datetime().optional().describe("Start ISO datetime if a time is known.")
ends_at:       z.string().datetime().optional()
amount:        z.number().nonnegative().optional().describe("Known price; omit if unknown. Never invented.")
currency:      z.enum(CURRENCIES).optional()
link:          z.string().url().optional().describe("Booking/manage URL if any.")
status:        z.enum(['TO BOOK','BOOKED','OPTIONAL','CHECK']).default('TO BOOK').describe("Ledger status.")
notes:         z.string().optional()
```

**`update_itinerary_item`** — Backing ✅ (`bookings` update)
> Change fields on an existing itinerary item. Confirm at L1. Cannot change ownership or trip.
```
item_id:       z.string().uuid().describe("The booking/itinerary item id.")
patch:         z.object({ /* same optional fields as add_itinerary_item */ }).describe("Only the fields to change.")
```

**`set_traveller_preferences`** — Backing 🆕 (new store — Q4)
> Record durable traveller preferences (cabin, seat, diet, pace, budget style) to personalise suggestions. Non-financial. Never store passport/payment data here.
```
trip_id:       z.string().uuid().optional().describe("Scope to a trip; omit for account-wide defaults.")
preferences:   z.object({
                 cabin: z.enum(['economy','premium_economy','business','first']).optional(),
                 max_stops: z.number().int().min(0).max(3).optional(),
                 diet: z.string().optional().describe("e.g. 'vegetarian'. Free text, non-medical."),
                 pace: z.enum(['relaxed','balanced','packed']).optional(),
                 budget_style: z.enum(['budget','mid','premium']).optional(),
               }).describe("Preference fields to set/merge.")
```

### Financial / irreversible (**always** ApprovalGate; non-refundable → second confirm)

**`hold_offer`** — Backing 🆕 (Duffel holds, where supported; TEST-mode)
> Place a temporary hold on a Duffel offer to lock its price without paying, where the fare supports it. Returns hold expiry. Requires approval. Not a purchase, but treated as financial-adjacent.
```
offer_id:      z.string().describe("Offer id to hold (validate with get_offer first).")
trip_id:       z.string().uuid()
```

**`create_booking`** — Backing 🆕 (**NEW capability; TEST-mode only in v1 — see Q2**)
> The ONLY tool that spends money. Creates a Duffel order for a validated offer. MUST call get_offer first and abort if price/availability moved. ALWAYS pauses for an ApprovalGate showing the exact amount and refund status; non-refundable fares require a second explicit confirmation. In v1 this creates TEST orders only — no real card is charged.
```
offer_id:      z.string().describe("Offer id, freshly validated via get_offer in the same flow.")
trip_id:       z.string().uuid()
expected_amount: z.number().positive().describe("The amount the user approved; handler aborts if Duffel's current total differs.")
expected_currency: z.enum(CURRENCIES)
passengers:    z.array(z.object({ /* given_name, family_name, dob, ... */ }))
                 .describe("Passenger details. Passport/payment data is NEVER accepted here — collected out-of-band in Duffel's vault.")
authorization_id: z.string().optional().describe("Signed, single-use, amount-bounded grant when invoked outside the app (MCP). Required off-app.")
```

**`cancel_booking`** — Backing 🆕 (Duffel order cancellation)
> Cancel a booking where the fare permits. Irreversible; shows refund amount/status and requires approval. Never auto-runs.
```
booking_id:    z.string().uuid().describe("The trip's booking record id.")
reason:        z.string().optional()
```

**Structured error shape (all tools):** `{ code, message, recovery_hint }` — e.g. `{ code: 'OFFER_EXPIRED', message: 'This fare expired 3 min ago.', recovery_hint: 'Call search_flights again, then get_offer on the new id.' }`. Codes: `VALIDATION_FAILED, NOT_FOUND, OFFER_EXPIRED, PRICE_MOVED, AVAILABILITY_LOST, AUTONOMY_DENIED, APPROVAL_REQUIRED, RATE_LIMITED, UPSTREAM_ERROR, NOT_SUPPORTED`.

**Transport exposure (forward look):** all read + non-financial mutate tools → in-app + MCP (elevated scope for mutate) + WebMCP. `hold_offer`/`create_booking`/`cancel_booking` → in-app only in v1; **excluded from MCP and WebMCP** per the prompt.

---

## 3. Assumptions & blocking questions

### Assumptions I had to make
- **A1.** "Quiet Wanderlust" in the prompt means the current `styles.css` tokens (Wanderlust Magazine). I'll build on those.
- **A2.** Zod is acceptable as a new dependency, used in both browser and Deno via a shared contracts module.
- **A3.** "Itinerary item" == a `bookings` row (the ledger already is the itinerary); `saved_places` remains for un-committed AI ideas.
- **A4.** `create_booking` in v1 targets **Duffel test-mode orders only**; no real card capture is in scope until Q2 is answered.
- **A5.** France 2026 is an existing trip in the demo account with real search endpoints reachable; CI mocks Duffel.
- **A6.** The autonomy model can be introduced now (it's absent) using the definition proposed in Q1.

### Questions I need answered before Phase 2
1. **Autonomy model.** It doesn't exist. Adopt this? **L1 Suggest** (confirm every mutation; default) · **L2 Assisted** (auto read + non-financial mutations; confirm all spend) · **L3 Supervised spend** (auto up to a per-trip cap; each spend still shows an ApprovalGate) · **L4 Pre-authorized** (spend within an explicit per-trip, per-amount grant; irreversible still shows a short auto-expiring gate; non-refundable always double-confirms). Note the tension with Principle 3 — even L4 shows a gate. OK?
2. **Payment — the big one.** The app has *no* payment path and an explicit no-PCI stance. Options: **(a) v1 = test-mode orders only, no real money** (recommended), **(b)** integrate Duffel Payments/Stripe now (large: PCI, passenger data, refunds — likely its own initiative), **(c)** keep deep-link-out and drop `create_booking` from v1. Which?
3. **Where does the future MCP server run?** Supabase Edge Function (Deno) hosting streamable-HTTP MCP, or a separate Node service? Affects the Phase-1 contracts-package location.
4. **`set_traveller_preferences` store:** new `traveller_preferences` table (per-user + optional per-trip, RLS), or JSON on `trips`/a `profiles` row? Any table needs RLS in the same change.
5. **Duffel Stays / real inventory:** stays are Google-fallback today. Do we enable Duffel Stays on the token for `search_stays`/stay orders, or keep stays read-only (search + deep-link) in the agentic layer for now?
6. **Activities backing:** `search_activities` — thin wrapper over Google Places `searchText`, or reuse the conversational `planner` function? (Planner is chat-shaped; a direct Places tool is cleaner for agents.)
7. **Contracts package location:** real workspace package (`packages/tool-contracts`, turns the repo into a monorepo) vs. a plain shared dir (`src/agent/contracts`) imported by Deno via relative path. Preference?
8. **Metrics dashboard visibility & admin identity:** `agent_tool_calls` is per-user (RLS). The metrics dashboard — per-user self-view, or an aggregate admin view (which needs a service-role reporting function + an admin identity we don't have yet)?
9. **France 2026 booking dogfood:** since real spend is out in v1, is the Phase 1 acceptance "booking" explicitly a **Duffel test order**? (I'll assume yes per A4.)

---

## 4. Recommendation
Approve A1–A6 and answer Q1, Q2, Q4, Q7 (the four that block file layout), and I'll proceed to Phase 1 implementation: contracts module → read tools (reusing existing functions) → `agent-tool` dispatch + `get-offer` + autonomy/redact/trace → `agent_tool_calls` migration → the France 2026 headless round-trip test. I'll stop again before Phase 2 (AG-UI), since that pulls in CopilotKit and the generative-UI surfaces.
