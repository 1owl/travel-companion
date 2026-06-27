# Travel Companion — Project Audit & State

_A single-file snapshot of the whole system: architecture, features, data, APIs,
deployment, tests, and upgrade candidates. Use it to audit and plan upgrades._

Last updated: 2026-06-25.

---

## 1. What it is
An all-in-one travel planning web app: plan trips, track bookings, budget across
currencies, get AI destination ideas, search flights & stays, and discover
destinations via a spinnable globe + AI "Trip Adviser".

**Stack:** React 18 + Vite 5, react-router-dom 6. Supabase (Postgres + Auth + RLS +
Storage + Edge Functions). Claude API + Google Places API + Duffel API + Unsplash.
One design system ("Quiet Wanderlust") via CSS custom properties in `src/styles.css`.

---

## 2. Source-of-truth files (read these first)
| Area | File |
|------|------|
| Project rules & conventions | `CLAUDE.md` |
| Design tokens / all styling | `src/styles.css` |
| Database schema + RLS | `supabase/schema.sql` |
| Routes | `src/App.jsx` |
| Build/scripts/deps | `package.json` |
| Env template | `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) |
| Deployment notes | this file §8, and memory `vps-deployment.md` |

---

## 3. Routes & pages
- `/` — `src/pages/Landing.jsx` (public marketing; `.lp` namespaced; live destination gallery + CTA).
- `/app` — `src/pages/TripsPage.jsx` (auth gate, trips list, **Discover** globe explorer).
- `/app/trip/:id` — `src/pages/TripDetail.jsx` (tabs: Itinerary, Booking ledger, Budget engine, Planner, Flights, Stays).
- Auth UI: `src/components/Auth.jsx` + `src/context/AuthContext.jsx`.

---

## 4. Components (`src/components/`)
| File | Purpose |
|------|---------|
| `Discover.jsx` | Spin-the-globe explorer; AI "Design my holiday" (stay/see/eat); creates trips. (Trip-Adviser engine wiring in progress — see §10.) |
| `Planner.jsx` | AI planner tab; grounded Google place cards; context-aware of the trip's bookings; add-to-itinerary. |
| `Flights.jsx` | Flight search (Duffel); cheapest↔comfort slider; **auto-origin via geolocation**; save quotes. |
| `Stays.jsx` | Accommodation search; Duffel Stays (live) → Google hotels + Booking.com fallback; save quotes. |
| `BookingLedger.jsx` + `BookingDrawer.jsx` + `QuickAddModal.jsx` | Booking table, detail drawer, AI quick-add-from-confirmation. |
| `BudgetEngine.jsx` | Multi-currency budget totals + per-person split. |
| `LiveItinerary.jsx` | Day-grouped timeline; offline cache; Maps links. |
| `TripCover.jsx` | Dynamic place-aware trip cover image. |
| `Art.jsx`, `Skeleton.jsx` | SVG graphics (RouteMap, EmptyState) and loading skeletons. |

## 5. Libraries (`src/lib/`) & hooks
`supabase.js` (client) · `currency.js` (FX, `toBase`) · `status.js` (status colour map) ·
`tripDates.js`, `itineraryCache.js` · `attachments.js`, `pdfText.js`, `parseConfirmation.js` ·
`savedPlaces.js`, `bookingLinks.js`, `planner.js` · `flights.js`, `priceQuotes.js`, `airports.js` ·
`stays.js` · `images.js` + `hooks/useDynamicImage.js` · `photos.js` · `destinations.js` ·
`tripAdviser.js`. Tests sit beside each as `*.test.js(x)` (Vitest).

---

## 6. Edge Functions (`supabase/functions/`) — server-side secrets only
| Function | Does | Keys | Status |
|----------|------|------|--------|
| `parse-confirmation` | Claude structured extraction of a pasted booking | ANTHROPIC_API_KEY (PARSE_MODEL) | ✅ live |
| `planner` | Claude tool-use + Google Places → grounded place cards (trip-context aware) | ANTHROPIC_API_KEY, GOOGLE_PLACES_API_KEY (PLANNER_MODEL=claude-haiku-4-5) | ✅ live |
| `search-flights` | Duffel flight offers | DUFFEL_API_KEY (DUFFEL_VERSION) | ✅ live |
| `search-stays` | Duffel Stays → Google hotels fallback | DUFFEL_API_KEY, GOOGLE_PLACES_API_KEY | ⚠️ live via fallback (Duffel Stays not enabled on account → 403) |
| `image-search` | Unsplash place-aware photos | UNSPLASH_ACCESS_KEY | ✅ live |
| `trip-adviser` | Claude + web_search → structured flights/stays/briefing JSON | ANTHROPIC_API_KEY (TRIP_ADVISER_MODEL=claude-sonnet-4-6) | 🚧 deployed; web_search availability + UI wiring being verified |

Deploy one: `npx.cmd supabase functions deploy <name> --project-ref upvdcmjyyewgdvjcizbt`

---

## 7. Database (Supabase Postgres) — `supabase/schema.sql`
All tables RLS-protected per-user (`auth.uid() = user_id`), idempotent policies, grants to anon/authenticated.
- `trips` (name, dates, travelers, base_currency)
- `bookings` (title, category, date, status TO BOOK/BOOKED/OPTIONAL/CHECK, amount, currency, paid, link, saved_place_id)
- `budget_items` (qty × price × currency)
- `attachments` (private `attachments` Storage bucket: `{uid}/{tripId}/{uuid}.ext`)
- `saved_places` (planner ideas; google_place_id, status)
- `price_quotes` (saved flight/stay quotes; kind, source, title, price, currency, deep_link, fetched_at)

---

## 8. External services & live status
| Service | Use | Status / note |
|---------|-----|---------------|
| Supabase | DB/Auth/Storage/Functions | ✅ project ref `upvdcmjyyewgdvjcizbt` |
| Claude API | parser, planner, trip-adviser | ✅ pay-as-you-go credit; models: haiku-4-5 (planner/parse), sonnet-4-6 (adviser) |
| Google Places (New) | planner places, stays fallback, geocoding | ✅ enabled |
| Duffel — Flights | live flight offers | ✅ test token |
| Duffel — Stays | live hotel prices | ⛔ not enabled (needs Duffel "Stays" product/approval) → Google+Booking fallback used |
| Unsplash | dynamic photos | ✅ access key set |
| Claude web_search | trip-adviser grounding | 🔎 verifying; degrades to estimates if unavailable |

**Browser bundle only uses** the Supabase URL + `sb_publishable_` key. All other keys live ONLY in Edge Function secrets.

---

## 9. Deployment
- **Live:** https://168.231.119.20/ — Hostinger **VPS**, Docker + Traefik (host-mode) → `nginx` container `travelapp` on `travelnet` bridge, SPA `try_files`, self-signed TLS on `websecure`.
- **No domain yet** → browser shows a cert warning (self-signed + raw IP). A domain + A-record would unlock auto Let's Encrypt (zero-warning HTTPS).
- **Redeploy frontend:** `npm run build` → zip `dist/*` (forward-slash) → upload to Supabase Storage (signed URL) → on VPS `curl` the zip, extract into `/opt/travelapp/site`, `docker restart travelapp`. (Full recipe in memory `vps-deployment.md`.)
- Static-host config also present (`public/_redirects`, `vercel.json`, `public/.htaccess`) from earlier Netlify attempts — harmless.

---

## 10. Testing & quality gate
- `npm run verify` = lint (ESLint) + test (Vitest) + e2e (Playwright). Currently ~95 unit/component tests + 1 e2e, all green.
- `scripts/shots.mjs` captures screenshots (Playwright) into `public/shots` + `shots/`.
- Standing rule: resolve CRITICAL/HIGH issues in-run; no feature "done" until gate green + manual happy-path.

---

## 11. Known gaps & upgrade candidates (audit targets)
1. **Duffel Stays** not enabled → live nightly prices unavailable; on Google+Booking fallback. _Upgrade:_ enable Stays on Duffel for in-app prices.
2. **Trip-Adviser** engine: confirm `web_search` is enabled on the Anthropic account (else estimates only); finish the explorer UI wiring + structured result rendering.
3. **No custom domain / trusted TLS** — cert warning on the IP. _Upgrade:_ point a domain at `168.231.119.20`.
4. **Deploy is manual** (build → upload → VPS commands). _Upgrade:_ CI/auto-deploy (GitHub → build → push to VPS), or move frontend to a managed static host.
5. **Single e2e test** — broaden coverage (planner, flights, stays, discover happy-paths).
6. **API cost controls** — planner/adviser use Claude + web_search; consider caching, rate-limits, and budget guards.
7. **Mobile polish** — verify globe/explorer + tables on small screens; optional card-views for ledger/budget.
8. **Theme toggle** — dark `[data-theme="redeye"]` tokens exist but no UI switch.
9. **`DESIGN.txt` → `DESIGN.md`** — legacy spec predates current "Quiet Wanderlust" tokens; reconcile.
10. **Secrets hygiene** — rotate keys before any public launch; the demo account credentials are shared in chat history.

---

## 12. Where the rest of the context lives
- **Project memory** (decisions/progress, persists across sessions):
  `C:\Users\glenn\.claude\projects\C--Users-glenn-OneDrive-Desktop-Projects-Travel-App\memory\`
  → `MEMORY.md` (index), `build-progress.md`, `travel-app-setup.md`, `france-2026-data.md`,
  `design-system.md`, `vps-deployment.md`.
- **Build playbook:** `travel-companion-build-playbook.txt` (the staged plan, phases 0–5).
- **Design spec:** `DESIGN.txt` (principles; superseded palette/fonts by `styles.css` tokens).
