# Travel Companion — Project Status

_A single-file snapshot of where the app is right now: what it does, how it's built,
what's live, what works, and what's still pending._

**Last updated:** 2026-07-15

---

## 1. What it is

An all-in-one travel-planning web app: plan trips, capture bookings (incl. auto-extract
from confirmation emails/PDFs), budget across currencies, get AI destination ideas,
search flights & stays, and explore destinations via a 3D spin-the-globe + AI "Trip Adviser".

**Stack:** React 18 + Vite 5, react-router-dom 6 (HashRouter). Supabase (Postgres +
Auth + RLS + Storage + Edge Functions/Deno). Claude API + Google Places API + Duffel API
+ Unsplash. One design system via CSS custom properties in `src/styles.css`.

---

## 2. Live deployment

| Environment | URL | Notes |
|---|---|---|
| **Primary (GitHub Pages)** | https://1owl.github.io/travel-companion/ | Auto-deploys on push to `main` via GitHub Actions. Served under `/travel-companion/`. |
| VPS (secondary) | https://168.231.119.20/ | Hostinger VPS (Traefik + nginx); older, self-signed cert. |
| Supabase project | ref `upvdcmjyyewgdvjcizbt` | Postgres, Auth, Storage, 6 Edge Functions. |

**CI/CD:** `.github/workflows/deploy.yml` — on every push/PR runs `lint` + `test` (gate);
on `main` it also builds and deploys to Pages. Repo secrets: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` (both public-by-design; the build fails if any real secret leaks
into `dist/`).

---

## 3. Design system — "Wanderlust Magazine"

Bold editorial look (Lonely-Planet-inspired). Source of truth = CSS custom properties in
`src/styles.css` `:root` (+ `[data-theme="redeye"]` dark).

- White canvas, near-black warm ink, **one** hot-coral accent (`--primary`/`--accent` = `#E8462E`).
- **Bricolage Grotesque** (display/headings), **Inter** (UI), **Geist Mono** (numbers/data, tabular).
- Status colour language (`src/lib/status.js`): TO BOOK = amber, BOOKED = green, OPTIONAL = grey, CHECK = red.
- No colours/fonts/radii outside the tokens. Landing styles namespaced under `.lp`.

---

## 4. Routes & pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/pages/Landing.jsx` | Public marketing site; hero, feature grid, dynamic photo gallery, **split-flap stats board**, CTA. |
| `/app` | `src/pages/TripsPage.jsx` | Auth-gated trips list + **Discover** 3D globe explorer. |
| `/app/trip/:id` | `src/pages/TripDetail.jsx` | Per-trip tabs: Itinerary · Booking ledger · Budget · Planner · Flights · Stays. |

Auth: `src/components/Auth.jsx` + `src/context/AuthContext.jsx` (Supabase email/password).

---

## 5. Data model (`supabase/schema.sql`) — all tables RLS per `auth.uid()`

- **trips** — trip records (name, base currency, dates, cover).
- **bookings** — the ledger. Cols incl. `title, category, date, status, amount, currency,
  paid, link, notes, vendor, confirmation_no, starts_at, ends_at`.
- **budget_items** — budget line items (qty × unit_price, currency).
- **attachments** — file vault (Supabase Storage `attachments` bucket; per-user folder).
- **saved_places** — AI planner picks (Google-grounded).
- **price_quotes** — saved flight/stay quotes (kind = flight | stay), timestamped.
- **api_usage** + `check_rate_limit(fn, per_minute, per_day)` — per-user rate limiting for paid functions.

---

## 6. Edge Functions (Deno) — all JWT-gated + rate-limited

All live behind `_shared/guard.ts` (rejects anonymous with 401; enforces per-minute + per-day
caps via `check_rate_limit`). Paid functions **fail closed** (503) if the limiter is down;
`image-search` fails open.

| Function | Does | External API | Caps (min/day) |
|---|---|---|---|
| `parse-confirmation` | Extract **every** booking + provider link from a confirmation (text **or** scanned-page images via vision) | Claude | 10 / 100 |
| `planner` | Grounded destination suggestions | Claude + Google Places | 5 / 40 |
| `trip-adviser` | Structured trip research (flights/stays/briefing tiers) | Claude + web_search | 3 / 15 |
| `search-flights` | Flight offers (labelled TEST) | Duffel | 6 / 60 |
| `search-stays` | Stays; falls back to Google hotels + Booking.com links | Duffel Stays + Google | 6 / 60 |
| `image-search` | Dynamic place photos | Unsplash | 30 / 300 |

Secrets live only in Supabase (never in the browser bundle): `ANTHROPIC_API_KEY`,
`GOOGLE_PLACES_API_KEY`, `DUFFEL_API_KEY`, `UNSPLASH_ACCESS_KEY`.

---

## 7. Feature status

| Feature | State | Notes |
|---|---|---|
| Trips CRUD | ✅ Working | |
| Booking ledger | ✅ Working | inline edit, status colours, attachments |
| **Quick-add from confirmation** | ✅ Working* | Multi-booking extraction, verified provider links, MIME/base64/HTML email decode, **vision OCR** for scanned PDFs/photos. *Vision path needs the latest function deploy — see §9. |
| Budget engine (multi-currency) | ✅ Working | FX via `src/lib/currency.js` (`toBase`) — single source for all totals |
| Live itinerary | ✅ Working | offline cache |
| AI Planner | ✅ Working | Google-Places-grounded; never invents prices/hours |
| Flights (Duffel) | ✅ Working | **TEST mode** — fares labelled as test data |
| Stays | ✅ Working | Duffel Stays → Google hotels + Booking.com fallback (Duffel Stays not enabled on test token) |
| Discover globe + Trip Adviser | ✅ Working | 3D globe.gl fly-to; adviser uses web_search, degrades to estimates |
| Dynamic photos (Unsplash) | ✅ Working | travel-biased, relevance-ranked |
| Split-flap stats board (landing) | ✅ Working | airport-board flip animation on scroll |

---

## 8. Launch-hardening status (pre-go-live invariants)

| Invariant | State |
|---|---|
| Every Edge Function verifies JWT, 401 for anon | ✅ all 6 |
| Per-user rate-limit + daily cap, friendly 429 | ✅ (`check_rate_limit` applied 2026-07-15) |
| No secret key in browser bundle (build-time scan) | ✅ `scripts/check-bundle.mjs` in `build` |
| No hardcoded creds/tokens in repo | ✅ E2E creds via `.env`; nothing hardcoded |
| Duffel TEST fares labelled in UI | ✅ TEST banners on Flights/Stays |
| `npm run verify` green + manual happy-path | ⚠️ unit/lint green; full e2e happy-path on a fresh account still to be re-run |

---

## 9. Known issues & pending actions

1. **Deploy `parse-confirmation` for the vision path** (user action):
   `npx.cmd supabase functions deploy parse-confirmation`. The scanned-PDF/photo OCR only
   works once this is live. (Text/email extraction already works.)
2. **User's trip PDFs are all image-only** (0 text layer) — they require the vision path above.
3. **Duffel is in TEST mode** — never present simulated fares as bookable; live Stays prices
   need Duffel Stays enabled on the account (currently Google fallback).
4. **Full e2e happy-path** on a fresh account should be re-run before go-live.
5. **Custom domain / cert** for a cleaner URL (both Pages and VPS) — optional.
6. Dev-machine note: this is Windows-on-ARM; Smart App Control was intermittently blocking
   rollup's native binary (now disabled). No PDF rasteriser (poppler/ImageMagick/PyMuPDF) is
   installed locally, so PDF→image rendering happens only in the browser.

---

## 10. Testing & commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm run test` — Vitest (**116 unit/component tests**, all passing)
- `npm run e2e` — Playwright end-to-end
- `npm run lint` — ESLint
- `npm run build` — production build + secret scan
- `npm run verify` — lint + test + e2e (the gate)

Tests mock `src/lib/supabase.js` (no network in unit tests).

---

## 11. Recent work (this session)

- Whole-product re-skin to "Wanderlust Magazine" (editorial, coral accent, Bricolage Grotesque).
- 3D globe (globe.gl) with fly-to on the Discover explorer.
- Split-flap airport stats board on the landing page.
- **Confirmation → ledger extraction**: multi-booking, verified provider links, richer fields
  (category, check-in/out times, location).
- Email decoding (MIME / base64 / quoted-printable / HTML→text keeping URLs).
- **Vision OCR** for scanned PDFs & photos (rasterise pages → Claude vision).
- Surfacing real parser errors in the UI.
- **Diagnosed & fixed a systemic blocker**: `check_rate_limit` was missing from the DB, which
  fail-closed every paid function with a 503 — applied it, all paid functions unblocked.
- GitHub Pages deployment + absolute-base asset fix.
