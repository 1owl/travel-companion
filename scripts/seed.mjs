// Idempotent demo seed: a "France 2026 (seed)" trip with 3 bookings + 5 budget lines.
// Run: npm run seed   (loads .env via node --env-file)
//
// Requires in .env:
//   VITE_SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...   (Supabase → Project Settings → API → service_role)
// Optional:
//   SEED_EMAIL=glenn.demo2026@gmail.com   (the existing user to attach the demo trip to)
//
// Safe to re-run: it deletes any prior seed trip for the user, then recreates it.

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = process.env.SEED_EMAIL || 'glenn.demo2026@gmail.com'
const TRIP_NAME = 'France 2026 (seed)'

if (!url || !serviceKey) {
  console.error(
    '✗ Missing env. Add SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL) to .env.\n' +
    '  Get the service_role key from Supabase → Project Settings → API.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

async function findUserId(targetEmail) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find(u => (u.email || '').toLowerCase() === targetEmail.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  const userId = await findUserId(email)
  if (!userId) {
    console.error(`✗ No user found with email ${email}. Sign up that account first, or set SEED_EMAIL.`)
    process.exit(1)
  }

  // Idempotency: remove any previous seed trip (cascades to its bookings/budget).
  await admin.from('trips').delete().eq('user_id', userId).eq('name', TRIP_NAME)

  const { data: trip, error: tErr } = await admin.from('trips').insert({
    user_id: userId, name: TRIP_NAME,
    start_date: '2026-08-28', end_date: '2026-09-12',
    travelers: 2, base_currency: 'AUD',
  }).select('id').single()
  if (tErr) throw tErr
  const trip_id = trip.id

  const bookings = [
    { title: 'London: Accommodation (2 nights)', category: 'Hotel', date: '29–30 Aug', status: 'BOOKED', amount: 400, currency: 'AUD', paid: true },
    { title: 'London → Paris: Eurostar', category: 'Train', date: '31 Aug', status: 'TO BOOK', amount: 165, currency: 'AUD', link: 'https://www.eurostar.com' },
    { title: 'Annecy: AirBnB (3 nights)', category: 'AirBnB', date: '3–6 Sep', status: 'BOOKED', amount: 475, currency: 'AUD' },
  ].map(b => ({ ...b, trip_id, user_id: userId }))

  const budget = [
    { category: 'Accommodation', item: 'London hotel — 2 nights', qty: 1, unit_price: 400, currency: 'AUD' },
    { category: 'Inter-city', item: 'Eurostar London→Paris', qty: 2, unit_price: 44, currency: 'GBP' },
    { category: 'Inter-city', item: 'TGV Paris→Annecy', qty: 2, unit_price: 39, currency: 'EUR' },
    { category: 'Food', item: 'Paris — 3 days', qty: 2, unit_price: 180, currency: 'EUR' },
    { category: 'Flights & misc', item: 'Contingency / buffer', qty: 1, unit_price: 300, currency: 'AUD' },
  ].map(b => ({ ...b, trip_id, user_id: userId }))

  const { error: bErr } = await admin.from('bookings').insert(bookings)
  if (bErr) throw bErr
  const { error: gErr } = await admin.from('budget_items').insert(budget)
  if (gErr) throw gErr

  console.log(`✓ Seeded "${TRIP_NAME}" for ${email}: ${bookings.length} bookings, ${budget.length} budget lines (trip ${trip_id}).`)
}

main().catch(e => { console.error('✗ Seed failed:', e.message || e); process.exit(1) })
