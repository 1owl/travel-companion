import { describe, it, expect } from 'vitest'
import { co2Kg, co2Label, CO2_FACTORS } from './co2'

describe('co2Kg', () => {
  it('scales with distance and applies the mode factor + detour', () => {
    // flight: 1000km × 1.0 detour × 0.18 = 180
    expect(co2Kg(1000, 'flight')).toBe(180)
    // train: 1000km × 1.2 × 0.035 = 42
    expect(co2Kg(1000, 'train')).toBe(42)
  })

  it('orders modes by footprint over the same distance (ferry < bus < train < flight < drive)', () => {
    const d = 800
    expect(co2Kg(d, 'ferry')).toBeLessThan(co2Kg(d, 'bus'))
    expect(co2Kg(d, 'bus')).toBeLessThan(co2Kg(d, 'train'))
    expect(co2Kg(d, 'train')).toBeLessThan(co2Kg(d, 'flight'))
    expect(co2Kg(d, 'flight')).toBeLessThan(co2Kg(d, 'drive'))
  })

  it('returns null for an unknown mode or non-positive distance', () => {
    expect(co2Kg(500, 'teleport')).toBeNull()
    expect(co2Kg(0, 'train')).toBeNull()
    expect(co2Kg(-10, 'train')).toBeNull()
    expect(co2Kg(NaN, 'flight')).toBeNull()
  })

  it('covers every mode the comparison offers', () => {
    for (const mode of Object.keys(CO2_FACTORS)) {
      expect(co2Kg(500, mode)).toBeGreaterThan(0)
    }
  })
})

describe('co2Label', () => {
  it('formats a value and flags it as an estimate', () => {
    expect(co2Label(42)).toBe('~42 kg CO₂ est.')
  })
  it('returns null when there is nothing to show', () => {
    expect(co2Label(null)).toBeNull()
  })
})
