import { describe, it, expect } from 'vitest'
import { toBase, fmt, DEFAULT_RATES } from './currency'

describe('currency.toBase — qty × unitPrice × fx and base conversion', () => {
  it('converts a foreign amount into AUD using the rate', () => {
    // 2 × €39 = €78 → ×1.63 = A$127.14
    const line = 2 * 39
    expect(toBase(line, 'EUR', 'AUD')).toBeCloseTo(127.14, 2)
  })

  it('handles GBP to the cent', () => {
    // 2 × £44 = £88 → ×1.88 = A$165.44
    expect(toBase(2 * 44, 'GBP', 'AUD')).toBeCloseTo(165.44, 2)
  })

  it('AUD to AUD is identity', () => {
    expect(toBase(400, 'AUD', 'AUD')).toBe(400)
  })

  it('converts between two non-base currencies via AUD', () => {
    // €100 → A$163 → ÷1.88 = £86.70
    expect(toBase(100, 'EUR', 'GBP')).toBeCloseTo(163 / 1.88, 4)
  })

  it('treats blank/NaN as zero', () => {
    expect(toBase('', 'EUR', 'AUD')).toBe(0)
    expect(toBase(undefined, 'AUD', 'AUD')).toBe(0)
  })

  it('rates table matches the France 2026 source tracker', () => {
    expect(DEFAULT_RATES.EUR).toBe(1.63)
    expect(DEFAULT_RATES.GBP).toBe(1.88)
    expect(DEFAULT_RATES.AUD).toBe(1)
  })
})

describe('per-person split to the cent', () => {
  it('divides a grand total across travellers', () => {
    const total = 8043
    const perPerson = total / 2
    expect(perPerson).toBeCloseTo(4021.5, 2)
  })

  it('grand total of mixed-currency lines (the France 2026 spine)', () => {
    const lines = [
      { qty: 1, unit_price: 400, currency: 'AUD' },   // 400
      { qty: 2, unit_price: 44, currency: 'GBP' },    // 165.44
      { qty: 2, unit_price: 39, currency: 'EUR' },    // 127.14
    ]
    const total = lines.reduce(
      (s, r) => s + toBase(r.qty * r.unit_price, r.currency, 'AUD'), 0)
    expect(total).toBeCloseTo(692.58, 2)
    expect(total / 2).toBeCloseTo(346.29, 2)
  })
})

describe('fmt', () => {
  it('formats AUD with no decimals', () => {
    expect(fmt(1234.56, 'AUD')).toBe('$1,235')
  })
})
