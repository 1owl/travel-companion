# Spec — "How to get there" (multi-modal leg comparison)

_Executable build spec. Compare flight / train / bus / drive (ferry in Phase B) for an
origin → destination, tag Best value / Fastest / Greenest, and add the chosen leg to the
booking ledger. Inspired by Omio's multi-modal search, adapted to Travel Companion's
organize-and-budget niche._

**Status:** specced, not built. **Last updated:** 2026-07-18.

## Decisions (locked)
1. **Durations:** Google Routes API for real transit/drive times, with a distance-based estimate as fallback.
2. **Flights tab:** folded in — "Getting there" becomes the umbrella; the standalone Flights tab is retired. Flight is one mode, expandable to the full ranked list.
3. **Ground pricing:** never fabricated. Deep-link to a partner + optional user-entered price that feeds the budget.

## Compliance guardrails (non-negotiable, from CLAUDE.md)
- **No LLM-quoted prices.** Flight prices come from Duffel; ground prices are user-entered or absent. Durations/CO₂ are labelled "est." with a cited factor table.
- **JWT-gated + rate-limited**, fail-closed (paid function): `guard(req, 'search-journeys', 6, 60, true)`.
- **No secret in the browser bundle** — `DUFFEL_API_KEY`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY` live only in Supabase secrets.
- **Duffel TEST mode labelled** in the UI (reuse the `Flights.jsx` banner).
- **Every external call wrapped** — timeout, graceful partial result (one mode failing never blanks the others).

---

## 1. User flows
1. Open a trip → **Getting there** tab. Form prefilled: `To` from trip name (minus year, like `Stays.jsx`), `From` from `detectNearestAirport()` (existing), dates from `trip.start_date`.
2. Search → a row per mode: icon, duration, price (real / "Check ↗" / "＋ Add price"), CO₂ chip, tag chips.
3. Flight row expands → full Duffel list with the existing cheapest↔comfort slider (`rankOffers`).
4. **＋ Add price** on a ground row → inline field; on save it becomes a real, timestamped amount that flows into the budget.
5. **Add to ledger** on any row → creates a `TO BOOK` booking with mode, date, link, duration/CO₂ note, and amount when known.

## 2. Architecture

### Edge Function — `supabase/functions/search-journeys/index.ts` (new)
`guard(req, 'search-journeys', 6, 60, true)` first. Orchestrates everything server-side in one round-trip:
1. Geocode `origin` + `destination` via Places `searchText` (pattern from `search-stays`) → coords + country.
2. `haversineKm(a,b)` (reuse the haversine already in `src/lib/airports.js`, port to Deno) for the CO₂ base.
3. **Flight**: nearest airport per end, Duffel `air/offer_requests` (reuse `search-flights` logic). Return the ranked offer list; carry `test`.
4. **Ground**: Google Routes `computeRoutes` for `TRANSIT` (train/bus) and `DRIVE` → real `duration`. On failure → distance × per-mode speed factor (est.). No price.
5. `co2_kg = km × factor[mode]` (§6).
6. Build deep links (§4).
7. Normalize + timestamp.

**Response contract:**
```ts
{
  origin, destination, distance_km, fetched_at,
  test: boolean,
  options: [{
    mode: 'flight'|'train'|'bus'|'drive'|'ferry',
    price: number | null, currency: string | null,
    duration_min: number | null, duration_estimated: boolean,
    co2_kg: number | null,
    source: 'duffel'|'google_routes'|'estimate'|null,
    deep_link: string, fetched_at: string,
    offers?: Offer[]   // flight only: full ranked Duffel list for the expander
  }]
}
```

### Client lib — `src/lib/journeys.js` (new)
- `searchJourneys({origin, destination, depart_date, adults})` → `{ options, test, error }` (timeout + graceful empty, mirrors `flights.js`).
- `rankModes(options, base)` → adds `tags: string[]` (§5). Pure, unit-tested.
- `durationLabel(min)`, `co2Label(kg)`.
- Reuse `rankOffers`, `formatDuration` from `flights.js` for the flight expander.

### Component — `src/components/HowToGetThere.jsx` (new; replaces the Flights tab)
- Form as in §1.
- Results in a `StaggerList` (motion layer) of mode cards; tag chips coloured via `status.js` (Best value → booked/green, Fastest → tobook/amber, Greenest → a green mix). CO₂ chip labelled "est.".
- Duffel `test` → the existing `⚠️ TEST DATA` banner.
- Flight card: `<details>`-style expander → full offer table + the cheapest↔comfort slider (lifted from today's `Flights.jsx`).
- Ground card: **＋ Add price** (inline number + currency; defaults to `trip.base_currency`).
- Loading: `RowsSkeleton`. Empty/error states like `Flights.jsx`.

### Ledger integration — `addLegToLedger(trip, option)`
```js
supabase.from('bookings').insert({
  trip_id, title: `${modeLabel} — ${origin} → ${destination}`,
  category: modeLabel,                       // 'Flight'|'Train'|'Bus'|'Drive'|'Ferry'
  date: depart_date, starts_at: depart_date,
  amount: option.price ?? null,
  currency: option.currency ?? trip.base_currency,
  link: option.deep_link,
  notes: `${durationLabel(option.duration_min)} · ~${option.co2_kg}kg CO₂ (est.)`,
  status: 'TO BOOK',
})
```
Same insert shape as `QuickAddModal`. Budget picks it up via `currency.js` `toBase()`.

### Tab wiring — `src/pages/TripDetail.jsx`
- Replace the `flights` tab with `getthere` behind `VITE_FEATURE_GETTHERE` (mirror `FLIGHTS_ENABLED`). Keep the `stays` tab.
- Render `<HowToGetThere tripId={id} trip={trip} />`.

## 3. Folding in the existing Flights tab
- **Retire** `Flights.jsx` (its offer table + slider move into the flight-card expander of `HowToGetThere`).
- **Keep** `src/lib/flights.js` (`rankOffers`, `formatDuration`) — reused by the expander.
- **Keep** `search-flights` Edge Function for now (called internally by `search-journeys`; can be deprecated later). No client references it directly after this.
- **Keep** `price_quotes` + save/list flow for Phase B "save a comparison". "Add to ledger" is the primary CTA; per-mode save is Phase B.
- Update `Flights.test.jsx` → `HowToGetThere.test.jsx`.

## 4. Deep links (per mode)
- **Flight:** Google Flights (existing `googleFlights()` in `search-flights`).
- **Train/Bus:** Omio search URL (primary) + Trainline/Rome2Rio as alternates: `https://www.omio.com/search-frontend/results/<from>/<to>?departureDate=…`. Fall back to a Rome2Rio route URL when operator is unknown.
- **Drive:** Google Maps directions URL.
- **Ferry (Phase B):** Rome2Rio / direct operator.

## 5. Tag algorithm (pure, tested)
- **Fastest** = min `duration_min`.
- **Greenest** = min `co2_kg`.
- **Best value** = min price converted to base via `toBase()`, **among options with a real price**; omitted entirely if none priced (never guessed).
- Ties → all matching options get the tag; an option may hold several.

## 6. CO₂ model
`co2_kg = distance_km × detour × factor[mode]`, in one documented constants file, labelled **"est."** with a source note (EEA / UK DEFRA, per passenger-km):

| flight (short) | train | bus/coach | car (1 occ) | ferry (foot) |
|---|---|---|---|---|
| ~0.18 | ~0.035 | ~0.027 | ~0.17 | ~0.02 |

`detour ≈ 1.2` for ground modes (great-circle under-counts road/rail). Never presented as precise.

## 7. Schema
**MVP: none** — the ledger's existing columns carry it. **Phase B** (save a comparison) extends `price_quotes`:
```sql
alter table public.price_quotes add column if not exists mode text;
alter table public.price_quotes add column if not exists duration_min int;
alter table public.price_quotes add column if not exists co2_kg numeric;
```
RLS unchanged (already per-user).

## 8. Testing (keep `npm run verify` green)
- **Unit** `journeys.test.js`: `rankModes` tags incl. base-currency conversion + ties; `co2Kg`; coerce + graceful-empty; mock `./supabase`.
- **Component** `HowToGetThere.test.jsx`: renders mode cards; TEST banner when `test`; `addLegToLedger` inserts (mock supabase); "＋ Add price" writes an amount.
- **Real-browser** (Playwright, demo France 2026 trip): search, cards render + stagger, add a leg → appears in ledger, no console errors.

## 9. Rollout
- Feature flag `VITE_FEATURE_GETTHERE` (default on in dev; gate prod until verified).
- New Google Routes API must be enabled on the Google Cloud project + `GOOGLE_ROUTES_API_KEY` set in Supabase secrets.
- Deploy `search-journeys`; the rate-limiter (`check_rate_limit`) already exists.

## 10. Phasing
- **A (MVP, ~1–1.5d):** function + Routes + lib + component + ledger + tests; flights folded in.
- **B (~0.5–1d):** user-entered price → budget, ferry, return legs, save-comparison (`price_quotes`).
- **C:** door-to-door (airport/station transfer time + total) — synergy with idea #8.

## 11. Build checklist
- [ ] `search-journeys` Edge Function (geocode → Duffel + Routes → normalize), guard fail-closed.
- [ ] `GOOGLE_ROUTES_API_KEY` secret + Routes API enabled.
- [ ] `src/lib/journeys.js` + `journeys.test.js`.
- [ ] `src/lib/co2.js` (factors + `co2Kg`).
- [ ] `HowToGetThere.jsx` (+ move flight table/slider from `Flights.jsx`).
- [ ] `addLegToLedger`.
- [ ] `TripDetail.jsx`: `getthere` tab behind `VITE_FEATURE_GETTHERE`; retire Flights tab.
- [ ] Retire `Flights.jsx`; rename its test.
- [ ] `HowToGetThere.test.jsx`.
- [ ] `npm run verify` green + real-browser check.
- [ ] Update `PROJECT-STATUS.md`.
