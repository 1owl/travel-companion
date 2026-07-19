// The tool registry — the single list every transport draws from (in-app runtime,
// MCP server, WebMCP). Register a tool once here and it's available everywhere;
// if its behaviour differs by transport, that's a bug.

import searchFlights from './search-flights.tool'
import searchStays from './search-stays.tool'
import getOffer from './get-offer.tool'
import listTrips from './list-trips.tool'
import getItinerary from './get-itinerary.tool'
import searchActivities from './search-activities.tool'
import getTripBudget from './get-trip-budget.tool'
import createTrip from './create-trip.tool'
import addItineraryItem from './add-itinerary-item.tool'
import updateItineraryItem from './update-itinerary-item.tool'
import setTravellerPreferences from './set-traveller-preferences.tool'
import holdOffer from './hold-offer.tool'
import createBooking from './create-booking.tool'
import cancelBooking from './cancel-booking.tool'

import { confirmationFor } from '../autonomy'
import { withTrace } from '../trace'
import { err } from '../_result'

export const TOOLS = [
  searchFlights, searchStays, getOffer, listTrips, getItinerary, searchActivities, getTripBudget,
  createTrip, addItineraryItem, updateItineraryItem, setTravellerPreferences,
  holdOffer, createBooking, cancelBooking,
]

const BY_NAME = new Map(TOOLS.map(t => [t.name, t]))
export const getTool = name => BY_NAME.get(name) || null

// Transports: financial tools are in-app only in v1 (excluded from MCP + WebMCP).
const OFF_REMOTE = new Set(['create_booking', 'cancel_booking', 'hold_offer'])
export function listTools({ transport = 'in-app' } = {}) {
  return TOOLS.filter(t => transport === 'in-app' || !OFF_REMOTE.has(t.name))
}

// The manifest a model/transport advertises (name + description + JSON schema).
// zod-to-json-schema is added when the MCP/WebMCP transports land (Phase 3/4);
// for now expose the zod schema object under `inputSchema`.
export function toolManifest({ transport = 'in-app' } = {}) {
  return listTools({ transport }).map(t => ({
    name: t.name, description: t.description, annotations: t.annotations, inputSchema: t.inputSchema,
  }))
}

// Runtime entry point: enforce the autonomy gate, then execute with tracing.
// ctx: { autonomy, transport, approval, trip_id }. Returns a structured result.
// A tool that needs confirmation but hasn't been approved is refused here — the
// runtime is expected to surface an ApprovalGate and re-call with ctx.approval.
export async function runTool(name, input, ctx = {}) {
  const tool = getTool(name)
  if (!tool) return err('NOT_FOUND', `No tool named ${name}.`, 'Call one of the advertised tools.')
  if (ctx.transport && ctx.transport !== 'in-app' && OFF_REMOTE.has(name)) {
    return err('NOT_SUPPORTED', `${name} is not available over ${ctx.transport} in v1.`, 'Complete this action inside the app.')
  }
  const gate = confirmationFor(tool.annotations, ctx.autonomy)
  if (gate.confirm && !ctx.approval?.confirmed) {
    return err('APPROVAL_REQUIRED', gate.reason, 'Surface an ApprovalGate to the user, then re-call runTool with ctx.approval.confirmed = true.')
  }
  return withTrace(
    { tool: name, transport: ctx.transport || 'in-app', autonomy: ctx.autonomy || 'L1', trip_id: ctx.trip_id },
    input,
    () => tool.execute(input, ctx),
  )
}
