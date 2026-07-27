import { describe, it, expect, vi, beforeEach } from 'vitest'

// The live-FX layer keeps module state (liveRates), so each test re-imports a
// fresh module against a clean localStorage.

async function freshModule({ clearCache = true } = {}) {
  vi.resetModules()
  if (clearCache) localStorage.clear()
  return import('./currency')
}

const FEED_OK = {
  result: 'success',
  rates: { AUD: 1, EUR: 0.625, GBP: 0.5, USD: 0.75, NZD: 1.2, JPY: 110 },
}
// Expected "AUD per 1 unit": EUR → 1/0.625 = 1.6, GBP → 2, USD → 1.333...

describe('refreshRates — live feed with graceful degradation', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts the feed to AUD-per-unit and uses it for conversions', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => FEED_OK })
    const res = await m.refreshRates({ fetchImpl })
    expect(res.ok).toBe(true)
    expect(m.getRates().EUR).toBeCloseTo(1.6, 6)
    expect(m.getRates().GBP).toBeCloseTo(2, 6)
    // €100 → A$160 with the live table
    expect(m.toBase(100, 'EUR', 'AUD')).toBeCloseTo(160, 4)
    expect(m.getRatesMeta().source).toBe('live')
    expect(m.getRatesMeta().fetchedAt).toBeTruthy()
  })

  it('persists to localStorage and reloads from cache within TTL', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => FEED_OK })
    await m.refreshRates({ fetchImpl })
    expect(JSON.parse(localStorage.getItem('tc.fx.rates.v1')).rates.EUR).toBeCloseTo(1.6, 6)

    // Fresh module instance: no fetch, but the cached table is used.
    const m2 = await freshModule({ clearCache: false })
    expect(m2.getRates().EUR).toBeCloseTo(1.6, 6)
    expect(m2.getRatesMeta().source).toBe('cache')
    // initRates sees a warm cache and skips the network.
    const skip = await m2.initRates()
    expect(skip.skipped).toBe(true)
  })

  it('ignores a stale cache and falls back to DEFAULT_RATES', async () => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('tc.fx.rates.v1', JSON.stringify({
      rates: { AUD: 1, EUR: 9, GBP: 9, USD: 9, NZD: 9, JPY: 9 },
      fetchedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    }))
    const m = await import('./currency')
    expect(m.getRates()).toBe(m.DEFAULT_RATES)
    expect(m.getRatesMeta().source).toBe('fallback')
  })

  it('keeps the fallback when the feed fails — never throws', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    const res = await m.refreshRates({ fetchImpl })
    expect(res.ok).toBe(false)
    expect(m.getRates()).toBe(m.DEFAULT_RATES)
    expect(m.getRatesMeta().source).toBe('fallback')
  })

  it('rejects malformed feed bodies', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: 'success', rates: { EUR: -1 } }),
    })
    const res = await m.refreshRates({ fetchImpl })
    expect(res.ok).toBe(false)
    expect(m.getRates()).toBe(m.DEFAULT_RATES)
  })

  it('rejects non-OK HTTP responses', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    const res = await m.refreshRates({ fetchImpl })
    expect(res).toEqual({ ok: false, error: 'HTTP 503' })
    expect(m.getRates()).toBe(m.DEFAULT_RATES)
  })

  it('initRates triggers a refresh when the cache is cold', async () => {
    const m = await freshModule()
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => FEED_OK })
    vi.stubGlobal('fetch', fetchImpl)
    const res = await m.initRates()
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalled()
  })
})
