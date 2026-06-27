# Travel Companion — project rules

React + Vite + Supabase (Auth, Postgres, RLS, Storage) + Claude API + Google Places API.
Built in staged phases — see `travel-companion-build-playbook.txt`. One phase at a time;
a phase is not done until its gate (automated + manual happy-path) is green.

## Standing rules (from the playbook)

- Director owns invariants; agent owns implementation.
- "Verify, don't flag": resolve CRITICAL/HIGH issues in the same run.
- No feature is "done" until its acceptance tests pass AND the happy path has been
  manually confirmed in the browser.
- Never quote live prices or availability from the LLM. Prices come only from an API
  or a user-entered field, always timestamped.
- Every external call (Places, Claude, FX) is wrapped: timeout, retry, and a graceful
  empty-state. No silent failures.
- All new tables ship with RLS policies (per-user, `auth.uid()`) in the same change.

## Launch-hardening invariants (until go-live)

- Every Edge Function verifies the caller's Supabase JWT and rejects anonymous
  requests with 401 before doing any paid work (Claude/Places/Duffel/Unsplash).
- Every paid Edge Function is rate-limited per user and has a daily per-user
  spend/call cap; when exceeded it returns a friendly 429, never a silent burn.
- No secret key ever reaches the browser bundle. Only the Supabase URL and the
  `sb_publishable_` key are client-side. Fail the build if any other key string
  appears in `dist/`.
- No credentials, tokens, or demo passwords are hardcoded anywhere in the repo.
- If Duffel is in TEST mode, the UI must label flight/stay prices as test data —
  never present simulated fares to a real user as bookable.
- No feature is "done" until `npm run verify` is green AND the manual happy-path
  passes on a fresh account.

## Commands

- `npm run dev` — Vite dev server on http://localhost:5173
- `npm run test` — Vitest unit/component tests (watch: `npm run test:watch`)
- `npm run e2e` — Playwright end-to-end tests
- `npm run lint` — ESLint
- `npm run verify` — lint + test + e2e (the gate; must be green before advancing a phase)
- `npm run seed` — idempotent demo data (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`)

## Design system

- ONE unified system across the whole product — public landing (`/`) AND the app
  (`/app`). The canonical tokens are the CSS custom properties in `src/styles.css`
  `:root` (+ `[data-theme="redeye"]` dark): `--canvas --surface --surface-sunken
  --ink --body --muted --hairline --primary --accent`, the `--status-*` set,
  `--r-* --s-*` scales, `--font-display/ui/data`, `--e-*`.
- Current direction = "Wanderlust Magazine" (bold editorial, Lonely-Planet-inspired):
  white canvas, near-black warm `--ink`, ONE hot coral accent (`--primary`/`--accent`
  = `#E8462E`); **Bricolage Grotesque** display (bold/800 headings, tight tracking),
  **Inter** UI, **Geist Mono** data; big full-bleed photography + image-forward card
  grids. This SUPERSEDES the earlier "Quiet Wanderlust" (ivory/pine-teal/Fraunces) and
  the original `DESIGN.txt` palette — `styles.css` tokens are the source of truth; keep
  the *principles* (status language, mono numbers, photography drives colour).
- Do NOT introduce colours, fonts, or radii outside the tokens. Status tint =
  `color-mix(in srgb, var(--status-x) N%, var(--surface))`.
- Status colour language is one mapping (`src/lib/status.js`) used identically in
  ledger, budget, itinerary: TO BOOK=amber, BOOKED=green, OPTIONAL=grey, CHECK=red.
- Numbers (money, FX, dates, counts) render in `--font-data` (tabular). Headings in
  `--font-display`; body in `--font-ui`. Landing styles are namespaced under `.lp`.

## Conventions

- FX lives in `src/lib/currency.js`; `toBase()` converts to a trip's base currency.
  Budget engine and any new total must reuse this math, never re-implement it.
- Supabase client is `src/lib/supabase.js`. In tests, mock this module — never hit
  the network from unit/component tests.
- Server-side secrets (Claude key, Places key, service role) live ONLY in Supabase
  Edge Functions, never in the browser bundle. Browser uses the `sb_publishable_` key.
