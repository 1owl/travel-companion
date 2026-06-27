import { describe, it, expect } from 'vitest'
import { nearestAirport } from './airports'

describe('nearestAirport', () => {
  it('maps a coordinate to the closest major airport', () => {
    expect(nearestAirport(-33.87, 151.21).iata).toBe('SYD')  // Sydney CBD
    expect(nearestAirport(51.51, -0.13).iata).toBe('LHR')    // central London
    expect(nearestAirport(35.68, 139.69).iata).toBe('NRT')   // Tokyo
  })
  it('returns null for invalid input', () => {
    expect(nearestAirport(undefined, 10)).toBeNull()
    expect(nearestAirport('x', 'y')).toBeNull()
  })
})
