# Travel Companion — MVP

An all-in-one travel companion: accounts, trips, a **booking ledger**, and a
multi-currency **budget engine**, built on React + Vite + Supabase. This is the
shippable skeleton evolved from the France 2026 tracker.

## What works now
- Email/password accounts (Supabase Auth)
- Create / open / delete **trips** (base currency + traveller count per trip)
- **Booking ledger** per trip: title, category, date, status (TO BOOK / BOOKED /
  OPTIONAL / CHECK), cost + currency, paid toggle, link — all synced to the cloud
- **Budget engine** per trip: line items with qty × unit price × FX, live grand
  total, per-person split, and category subtotals — in the trip's base currency
- Everything is **per-user and private** via Postgres Row Level Security

## Setup (about 10 minutes)
1. `npm install`
2. Create a free project at https://supabase.com
3. In Supabase → **SQL Editor**, paste & run `supabase/schema.sql`
4. `cp .env.example .env` and paste your **Project URL** and **anon public key**
   (Supabase → Project Settings → API)
5. `npm run dev` → open http://localhost:5173
6. Sign up, confirm your email, sign in, create a trip.

> Tip: for faster local testing, disable email confirmation in
> Supabase → Authentication → Providers → Email.

## Project layout
```
index.html
vite.config.js
src/
  main.jsx              app entry + router
  App.jsx               auth gate + routes
  styles.css            theme
  lib/supabase.js       Supabase client
  lib/currency.js       FX rates + conversion (swap for a live feed later)
  context/AuthContext   session + sign in/up/out
  components/Auth        login / signup screen
  pages/TripsPage        list + create trips
  pages/TripDetail       summary cards + tabs
  components/BookingLedger
  components/BudgetEngine
supabase/schema.sql      tables + RLS policies
```

## Roadmap (from the market research)
1. **Booking auto-import** — forward confirmation emails → auto-fill the ledger
   (TripIt's killer feature; your differentiator).
2. **Grounded AI planner** — generate itineraries via the Claude API with tool
   calls to Google Places / flight APIs, showing sources + freshness badges to
   beat the hallucination problem competitors have.
3. **Live FX + prices** — replace `DEFAULT_RATES` with an FX feed; never quote
   prices from the model.
4. **Affiliate links** (Stay22 / GetYourGuide / Booking) + Pro tier (~A$49/yr).
5. **Maps + curated place lists** (port the 20-per-destination lists).

## Notes
- FX rates in `src/lib/currency.js` are editable placeholders (June 2026).
- Generated June 2026.
