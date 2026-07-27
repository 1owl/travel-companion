// FX layer. Rates everywhere are "AUD per 1 unit of the currency".
// DEFAULT_RATES is the offline fallback (hand-checked June 2026). A live feed
// (open.er-api.com — free, no key) is refreshed in the background by
// initRates()/refreshRates(), cached 24h in localStorage, and converted into
// the same shape. On ANY failure the app keeps the cached or fallback table —
// no silent breakage, per the project's external-call invariant. All totals
// stay synchronous via getRates(); the network only ever runs in refreshRates().

export const CURRENCIES = ['AUD', 'EUR', 'GBP', 'USD', 'NZD', 'JPY']

export const DEFAULT_RATES = {
  AUD: 1,
  EUR: 1.63,
  GBP: 1.88,
  USD: 1.5,
  NZD: 0.92,
  JPY: 0.01
}

export const FX_FEED_URL = 'https://open.er-api.com/v6/latest/AUD'
const CACHE_KEY = 'tc.fx.rates.v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

let liveRates = null      // validated live table, same shape as DEFAULT_RATES
let liveMeta = null       // { source: 'live'|'cache', fetchedAt: ISO string }

function storageGet(key) {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key) } catch { return null }
}
function storageSet(key, value) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value) } catch { /* quota/denied — cache is best-effort */ }
}

// A table is usable only if every known currency maps to a finite positive rate.
function isValidTable(rates) {
  if (!rates || typeof rates !== 'object') return false
  return CURRENCIES.every(c => Number.isFinite(rates[c]) && rates[c] > 0)
}

// The feed returns "units of X per 1 AUD"; our convention is "AUD per 1 unit of X".
function fromFeed(feedRates) {
  const table = { AUD: 1 }
  for (const c of CURRENCIES) {
    if (c === 'AUD') continue
    const per = Number(feedRates?.[c])
    if (Number.isFinite(per) && per > 0) table[c] = 1 / per
  }
  return isValidTable(table) ? table : null
}

function readCache() {
  try {
    const raw = storageGet(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const fetchedAt = new Date(parsed.fetchedAt).getTime()
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > CACHE_TTL_MS) return null
    if (!isValidTable(parsed.rates)) return null
    liveRates = parsed.rates
    liveMeta = { source: 'cache', fetchedAt: parsed.fetchedAt }
    return parsed.rates
  } catch { return null }
}

// Warm the in-memory table from cache at module load (no network).
readCache()

// The rate table all conversions use: live if loaded, else the fallback.
export function getRates() {
  return liveRates ?? DEFAULT_RATES
}

// Freshness metadata for UI badges (never present a rate without a source).
export function getRatesMeta() {
  if (liveMeta) return liveMeta
  return { source: 'fallback', fetchedAt: null }
}

// Pull the live feed with a hard timeout; cache on success, degrade silently on
// failure. Returns a structured result — callers never need try/catch.
export async function refreshRates({ timeoutMs = 4000, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? fetch
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller && setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await doFetch(FX_FEED_URL, { signal: controller?.signal })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const body = await res.json()
    const table = body?.result === 'success' ? fromFeed(body.rates) : null
    if (!table) return { ok: false, error: 'feed rejected' }
    const fetchedAt = new Date().toISOString()
    liveRates = table
    liveMeta = { source: 'live', fetchedAt }
    storageSet(CACHE_KEY, JSON.stringify({ rates: table, fetchedAt }))
    return { ok: true, rates: table, fetchedAt }
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// App boot hook: refresh only when the cache is missing or stale. Fire-and-forget.
export function initRates(opts) {
  if (liveRates) return Promise.resolve({ ok: true, skipped: true })
  return refreshRates(opts).catch(() => ({ ok: false }))
}

// Convert an amount in `currency` into the trip base currency.
export function toBase(amount, currency, baseCurrency = 'AUD', rates = getRates()) {
  const amt = Number(amount) || 0
  const inAud = amt * (rates[currency] ?? 1)
  return inAud / (rates[baseCurrency] ?? 1)
}

// A single budget line converted to the base currency: qty × unit price × FX.
// Shared so the budget engine and any other total (itinerary snapshot) reuse the
// same math instead of re-implementing it.
export function lineBase(item, base = 'AUD') {
  return toBase((Number(item.qty) || 0) * (Number(item.unit_price) || 0), item.currency, base)
}

// Grand total of budget line items in the base currency.
export function sumBudget(items, base = 'AUD') {
  return (items || []).reduce((s, r) => s + lineBase(r, base), 0)
}

export function fmt(n, currency = 'AUD') {
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(Number(n) || 0)
  } catch {
    return currency + ' ' + Math.round(Number(n) || 0).toLocaleString()
  }
}
