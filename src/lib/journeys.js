// Client wrapper for the /search-journeys Edge Function ("How to get there").
// One call returns a comparable option per travel mode (flight / train / bus /
// drive). Defensive: timeout + graceful empty-state; never throws to the UI.
//
// Prices: flights are live (Duffel); ground modes carry no fabricated price
// (null) — the UI deep-links out and lets the traveller enter what they find.
// CO₂ is attached here from the trip's point-to-point distance, so the emission
// factors live in exactly one place (src/lib/co2.js).

import { supabase } from './supabase'
import { co2Kg } from './co2'
import { toBase } from './currency'

const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive', ferry: 'Ferry' }
export const modeLabel = m => MODE_LABEL[m] || (m ? m[0].toUpperCase() + m.slice(1) : 'Leg')

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Journey search timed out.')), ms))

// Returns { options, test, distance_km, error }. options[] is [] on any failure.
export async function searchJourneys(input, { timeoutMs = 55000 } = {}) {
  const origin = String(input?.origin || '').trim()
  const destination = String(input?.destination || '').trim()
  const depart_date = String(input?.depart_date || '').trim()
  const adults = Math.min(Math.max(Number(input?.adults) || 1, 1), 9)
  if (!origin || !destination) {
    return { options: [], test: false, error: { message: 'Enter where you’re travelling from and to.' } }
  }
  try {
    const call = supabase.functions.invoke('search-journeys', {
      body: { origin, destination, depart_date, adults },
    })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { options: [], test: false, error }
    const distance_km = Number(data?.distance_km) || null
    const options = (Array.isArray(data?.options) ? data.options : []).map(o => ({
      ...o,
      // Attach CO₂ here (single source of factors) unless the server already did.
      co2_kg: o.co2_kg ?? co2Kg(distance_km, o.mode),
    }))
    return { options, test: !!data?.test, distance_km, meta: { fetched_at: data?.fetched_at }, error: null }
  } catch (e) {
    return { options: [], test: false, error: { message: e?.message || 'Journey search failed.' } }
  }
}

// Tag each option Best value / Fastest / Greenest. Pure — the component renders
// the tags as chips. Best value compares prices in the trip's base currency and
// is omitted entirely when no option has a real price (never guessed).
export function rankModes(options, base = 'AUD') {
  const list = Array.isArray(options) ? options : []

  const priced = list.filter(o => Number.isFinite(o.price))
  const cheapestBase = priced.length
    ? Math.min(...priced.map(o => toBase(o.price, o.currency || base, base)))
    : null

  const timed = list.filter(o => Number.isFinite(o.duration_min))
  const fastest = timed.length ? Math.min(...timed.map(o => o.duration_min)) : null

  const green = list.filter(o => Number.isFinite(o.co2_kg))
  const greenest = green.length ? Math.min(...green.map(o => o.co2_kg)) : null

  return list.map(o => {
    const tags = []
    if (cheapestBase != null && Number.isFinite(o.price)
      && Math.abs(toBase(o.price, o.currency || base, base) - cheapestBase) < 1e-6) tags.push('Best value')
    if (fastest != null && o.duration_min === fastest) tags.push('Fastest')
    if (greenest != null && o.co2_kg === greenest) tags.push('Greenest')
    return { ...o, tags }
  })
}

export function durationLabel(min) {
  if (!Number.isFinite(min) || min <= 0) return null
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
