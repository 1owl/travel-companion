import { describe, it, expect, vi } from 'vitest'

// toolActions imports runTool → the tool chain → supabase; stub it (no network).
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}), functions: { invoke: vi.fn() } } }))

import { zodToParams, buildActionConfig } from './toolActions'
import { searchFlightsInput, createBookingInput } from '../contracts/schemas'
import searchFlights from '../tools/search-flights.tool'

describe('zodToParams', () => {
  it('maps Zod fields to CopilotKit params with types + required flags', () => {
    const params = zodToParams(searchFlightsInput)
    const by = Object.fromEntries(params.map(p => [p.name, p]))
    expect(by.origin).toMatchObject({ type: 'string', required: true })
    expect(by.destination.required).toBe(true)
    expect(by.depart_date.required).toBe(true)
    expect(by.adults).toMatchObject({ type: 'number', required: false }) // has a default
    expect(by.cabin.required).toBe(false)
    expect(by.max_stops).toMatchObject({ type: 'number', required: false }) // optional
    expect(by.origin.description).toMatch(/IATA|Departure/)
  })

  it('marks passengers as an array param', () => {
    const params = zodToParams(createBookingInput)
    expect(params.find(p => p.name === 'passengers').type).toBe('object[]')
    expect(params.find(p => p.name === 'expected_amount').type).toBe('number')
  })
})

describe('buildActionConfig', () => {
  it('produces a CopilotKit action wired to the tool', () => {
    const cfg = buildActionConfig(searchFlights)
    expect(cfg.name).toBe('search_flights')
    expect(cfg.description.length).toBeGreaterThan(20)
    expect(Array.isArray(cfg.parameters)).toBe(true)
    expect(typeof cfg.handler).toBe('function')
  })
})
