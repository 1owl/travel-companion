import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Configurable Supabase mock (hoisted so vi.mock can see it) ────────────────
const h = vi.hoisted(() => {
  const state = { invoke: {}, table: {}, inserted: [] }
  const resolveInvoke = (name) => state.invoke[name] ?? { data: null, error: null }
  const resolveTable = (b) => {
    if (b._op === 'insert') state.inserted.push({ table: b._table, payload: b._payload })
    const k = `${b._table}.${b._op}${b._single ? '.single' : ''}`
    return state.table[k] ?? state.table[`${b._table}.${b._op}`] ?? { data: b._op === 'select' ? [] : null, error: null }
  }
  return { state, resolveInvoke, resolveTable }
})

vi.mock('../lib/supabase', () => {
  const build = (table) => {
    const b = { _table: table, _op: 'select' }
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b
    b.insert = v => { b._op = 'insert'; b._payload = v; return b }
    b.update = v => { b._op = 'update'; b._payload = v; return b }
    b.upsert = v => { b._op = 'upsert'; b._payload = v; return b }
    b.single = () => { b._single = true; return b }
    b.then = (res, rej) => Promise.resolve(h.resolveTable(b)).then(res, rej)
    return b
  }
  return {
    supabase: {
      from: t => build(t),
      functions: { invoke: (name) => Promise.resolve(h.resolveInvoke(name)) },
    },
  }
})

import { TOOLS, getTool, listTools, runTool } from './tools/index'
import { confirmationFor, atLeast } from './autonomy'
import { redact } from './redact'

const setInvoke = (name, data, error = null) => { h.state.invoke[name] = { data, error } }
const setTable = (key, data, error = null) => { h.state.table[key] = { data, error } }

beforeEach(() => { h.state.invoke = {}; h.state.table = {}; h.state.inserted = [] })

// ── Registry ─────────────────────────────────────────────────────────────────
describe('registry', () => {
  it('exposes 14 tools, each with name/description/schema/execute', () => {
    expect(TOOLS).toHaveLength(14)
    for (const t of TOOLS) {
      expect(typeof t.name).toBe('string')
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.inputSchema).toBeTruthy()
      expect(typeof t.execute).toBe('function')
    }
  })
  it('hides financial tools from remote transports', () => {
    const remote = listTools({ transport: 'mcp' }).map(t => t.name)
    expect(remote).not.toContain('create_booking')
    expect(remote).not.toContain('cancel_booking')
    expect(remote).not.toContain('hold_offer')
    expect(remote).toContain('search_flights')
  })
})

// ── Validation: agent params are never trusted ────────────────────────────────
describe('input validation', () => {
  it('rejects bad params with a structured VALIDATION_FAILED naming the field', async () => {
    const r = await getTool('search_flights').execute({ origin: 'LON' }) // missing destination/date
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('VALIDATION_FAILED')
    expect(r.error.message).toMatch(/destination|depart_date/)
    expect(r.error.recovery_hint).toBeTruthy()
  })
})

// ── Read tools ────────────────────────────────────────────────────────────────
describe('read tools', () => {
  it('search_flights returns offers and honours max_stops', async () => {
    setInvoke('search-flights', { results: [
      { id: 'o1', airline: 'AF', price: 200, currency: 'EUR', stops: 0, duration: 'PT1H' },
      { id: 'o2', airline: 'BA', price: 150, currency: 'EUR', stops: 2, duration: 'PT5H' },
    ], test: true, fetched_at: 'now' })
    const r = await getTool('search_flights').execute({ origin: 'LHR', destination: 'CDG', depart_date: '2026-10-01', max_stops: 0 })
    expect(r.ok).toBe(true)
    expect(r.data.results.map(o => o.id)).toEqual(['o1'])
    expect(r.data.test).toBe(true)
  })

  it('search_stays maps location→place and passes through', async () => {
    setInvoke('search-stays', { results: [{ id: 's1', name: 'Hotel', per_night: 120 }], source: 'google_places', nights: 3, test: false })
    const r = await getTool('search_stays').execute({ location: 'Lyon', check_in: '2026-10-01', check_out: '2026-10-04' })
    expect(r.ok).toBe(true)
    expect(r.data.results).toHaveLength(1)
  })

  it('get_offer surfaces expiry as OFFER_EXPIRED', async () => {
    setInvoke('get-offer', { error: 'This offer has expired.', code: 'expired' })
    const r = await getTool('get_offer').execute({ offer_id: 'o1' })
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('OFFER_EXPIRED')
  })

  it('list_trips derives status from dates', async () => {
    setTable('trips.select', [
      { id: 't1', name: 'France 2026', end_date: '2026-12-31' },
      { id: 't2', name: 'Old', end_date: '2020-01-01' },
    ])
    const r = await getTool('list_trips').execute({ status: 'past' })
    expect(r.ok).toBe(true)
    expect(r.data.trips.map(t => t.id)).toEqual(['t2'])
  })

  it('get_itinerary reads the bookings ledger', async () => {
    setTable('bookings.select', [{ id: 'b1', title: 'Eurostar', category: 'Train' }])
    const r = await getTool('get_itinerary').execute({ trip_id: '11111111-1111-4111-8111-111111111111' })
    expect(r.ok).toBe(true)
    expect(r.data.items).toHaveLength(1)
  })

  it('get_trip_budget computes planned/committed/remaining in base currency', async () => {
    setTable('trips.select.single', { base_currency: 'AUD', travelers: 2 })
    setTable('budget_items.select', [{ qty: 2, unit_price: 100, currency: 'AUD' }]) // planned 200
    setTable('bookings.select', [{ amount: 50, currency: 'AUD', status: 'BOOKED' }, { amount: 999, currency: 'AUD', status: 'TO BOOK' }])
    const r = await getTool('get_trip_budget').execute({ trip_id: '11111111-1111-4111-8111-111111111111' })
    expect(r.ok).toBe(true)
    expect(r.data.planned).toBe(200)
    expect(r.data.committed).toBe(50) // only BOOKED counts
    expect(r.data.remaining).toBe(150)
  })

  it('search_activities is backed by the grounded planner', async () => {
    setInvoke('planner', { reply: 'here', cards: [{ name: 'Basilica' }] })
    const r = await getTool('search_activities').execute({ location: 'Lyon', category: 'sight' })
    expect(r.ok).toBe(true)
    expect(r.data.activities).toHaveLength(1)
  })
})

// ── Mutating (non-financial) tools ────────────────────────────────────────────
describe('mutating tools', () => {
  it('create_trip inserts and returns the trip', async () => {
    setTable('trips.insert.single', { id: 't9', name: 'France 2026', base_currency: 'AUD', travelers: 2 })
    const r = await getTool('create_trip').execute({ name: 'France 2026' })
    expect(r.ok).toBe(true)
    expect(r.data.trip.id).toBe('t9')
    expect(h.state.inserted.some(i => i.table === 'trips')).toBe(true)
  })

  it('add_itinerary_item writes a bookings row', async () => {
    setTable('bookings.insert.single', { id: 'b9', title: 'Lyon hotel', category: 'Accommodation', status: 'TO BOOK' })
    const r = await getTool('add_itinerary_item').execute({
      trip_id: '11111111-1111-4111-8111-111111111111', title: 'Lyon hotel', category: 'Accommodation',
    })
    expect(r.ok).toBe(true)
    expect(r.data.item.id).toBe('b9')
  })

  it('update_itinerary_item drops undefined fields and needs at least one', async () => {
    const empty = await getTool('update_itinerary_item').execute({ item_id: '22222222-2222-4222-8222-222222222222', patch: {} })
    expect(empty.error.code).toBe('VALIDATION_FAILED')
    setTable('bookings.update.single', { id: 'b2', status: 'BOOKED' })
    const r = await getTool('update_itinerary_item').execute({ item_id: '22222222-2222-4222-8222-222222222222', patch: { status: 'BOOKED' } })
    expect(r.ok).toBe(true)
  })

  it('set_traveller_preferences upserts (no PII)', async () => {
    setTable('traveller_preferences.upsert.single', { trip_id: null, preferences: { cabin: 'business' } })
    const r = await getTool('set_traveller_preferences').execute({ preferences: { cabin: 'business' } })
    expect(r.ok).toBe(true)
    expect(r.data.preferences.cabin).toBe('business')
  })
})

// ── Financial tools: always gated ─────────────────────────────────────────────
describe('financial tools require approval (Principle 3)', () => {
  it('create_booking refuses without approval, at ANY autonomy', async () => {
    const r = await getTool('create_booking').execute({
      offer_id: 'o1', trip_id: '11111111-1111-4111-8111-111111111111',
      expected_amount: 200, expected_currency: 'EUR', passengers: [{ given_name: 'A', family_name: 'B' }],
    }, { autonomy: 'L4' }) // even L4
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('APPROVAL_REQUIRED')
  })

  it('hold_offer and cancel_booking also gate on approval', async () => {
    const h1 = await getTool('hold_offer').execute({ offer_id: 'o1', trip_id: '11111111-1111-4111-8111-111111111111' }, {})
    const c1 = await getTool('cancel_booking').execute({ booking_id: '33333333-3333-4333-8333-333333333333' }, {})
    expect(h1.error.code).toBe('APPROVAL_REQUIRED')
    expect(c1.error.code).toBe('APPROVAL_REQUIRED')
  })
})

// ── Autonomy gate ─────────────────────────────────────────────────────────────
describe('autonomy', () => {
  it('reads never confirm; financial always confirms; mutations confirm only at L1', () => {
    expect(confirmationFor({ readOnlyHint: true }, 'L1').confirm).toBe(false)
    expect(confirmationFor({ financialHint: true }, 'L4').confirm).toBe(true)
    expect(confirmationFor({ destructiveHint: false }, 'L1').confirm).toBe(true)
    expect(confirmationFor({ destructiveHint: false }, 'L2').confirm).toBe(false)
  })
  it('atLeast orders the levels', () => {
    expect(atLeast('L3', 'L2')).toBe(true)
    expect(atLeast('L1', 'L2')).toBe(false)
  })
})

// ── Redaction ─────────────────────────────────────────────────────────────────
describe('redact', () => {
  it('strips passengers, passport, payment and names', () => {
    const out = redact({ trip_id: 't1', passengers: [{ given_name: 'Jane', family_name: 'Doe' }], passport_number: 'X1', payment_token: 'tok', nested: { card: '4111' } })
    expect(out.trip_id).toBe('t1')
    expect(out.passengers).toMatch(/1 passenger/)
    expect(out.passport_number).toBe('[redacted]')
    expect(out.payment_token).toBe('[redacted]')
    expect(out.nested.card).toBe('[redacted]')
  })
})

// ── runTool: gate + trace + transport ─────────────────────────────────────────
describe('runTool', () => {
  it('blocks an unapproved mutation at L1 and writes no row', async () => {
    const r = await runTool('create_trip', { name: 'X' }, { autonomy: 'L1' })
    expect(r.error.code).toBe('APPROVAL_REQUIRED')
    expect(h.state.inserted.some(i => i.table === 'trips')).toBe(false)
  })
  it('runs an approved mutation and traces the call', async () => {
    setTable('trips.insert.single', { id: 't9', name: 'X' })
    const r = await runTool('create_trip', { name: 'X' }, { autonomy: 'L1', approval: { confirmed: true } })
    expect(r.ok).toBe(true)
    expect(h.state.inserted.some(i => i.table === 'agent_tool_calls')).toBe(true) // traced
  })
  it('refuses a financial tool over a remote transport', async () => {
    const r = await runTool('create_booking', {}, { transport: 'mcp' })
    expect(r.error.code).toBe('NOT_SUPPORTED')
  })
})

// ── France 2026 acceptance: search → offer → (mocked) booking, no UI ───────────
describe('France 2026 round-trip (headless)', () => {
  const TRIP = '44444444-4444-4444-8444-444444444444'
  const passengers = [{ given_name: 'Glenn', family_name: 'Traveller' }]

  it('books only after re-pricing, and aborts on a price move', async () => {
    // 1) search
    setInvoke('search-flights', { results: [{ id: 'off_fr1', airline: 'Air France', price: 320, currency: 'EUR', stops: 0, duration: 'PT1H25M' }], test: true, fetched_at: 'now' })
    const search = await runTool('search_flights', { origin: 'MEL', destination: 'CDG', depart_date: '2026-10-01', adults: 1 }, { autonomy: 'L2', trip_id: TRIP })
    expect(search.ok).toBe(true)
    const offerId = search.data.results[0].id

    // 2) re-price — matches
    setInvoke('get-offer', { offer_id: offerId, total_amount: 320, total_currency: 'EUR', refundable: true })
    // 3) book (approved) — create-booking succeeds
    setInvoke('create-booking', { booking_id: 'bk1', order_id: 'ord_1', amount: 320, currency: 'EUR', test: true })
    const booked = await runTool('create_booking', {
      offer_id: offerId, trip_id: TRIP, expected_amount: 320, expected_currency: 'EUR', passengers,
    }, { autonomy: 'L4', approval: { confirmed: true } })
    expect(booked.ok).toBe(true)
    expect(booked.data.booking_id).toBe('bk1')
    expect(booked.data.test).toBe(true)

    // now the price moves → must abort BEFORE calling create-booking
    setInvoke('get-offer', { offer_id: offerId, total_amount: 402, total_currency: 'EUR', refundable: true })
    const moved = await runTool('create_booking', {
      offer_id: offerId, trip_id: TRIP, expected_amount: 320, expected_currency: 'EUR', passengers,
    }, { autonomy: 'L4', approval: { confirmed: true } })
    expect(moved.ok).toBe(false)
    expect(moved.error.code).toBe('PRICE_MOVED')
  })

  it('non-refundable fares demand a second confirmation', async () => {
    setInvoke('get-offer', { offer_id: 'off_nr', total_amount: 99, total_currency: 'EUR', refundable: false })
    const r = await runTool('create_booking', {
      offer_id: 'off_nr', trip_id: TRIP, expected_amount: 99, expected_currency: 'EUR', passengers,
    }, { autonomy: 'L4', approval: { confirmed: true } }) // confirmed, but not nonRefundableConfirmed
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('APPROVAL_REQUIRED')
    expect(r.error.message).toMatch(/NON-REFUNDABLE/i)
  })
})
