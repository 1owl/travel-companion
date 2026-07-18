// CO₂ estimates for journey legs, for the "How to get there" comparison.
//
// Distance-based, using published per-passenger-km averages (UK DEFRA / EEA
// order-of-magnitude figures). These are ESTIMATES — the UI always labels them
// "est." and never presents them as precise. Factors live ONLY here so there is a
// single source; the Edge Function returns a point-to-point distance and the
// client attaches the CO₂ per mode via co2Kg().

// kg CO₂e per passenger-km (economy / single-occupant).
export const CO2_FACTORS = {
  flight: 0.18,  // short/medium-haul
  train: 0.035,
  bus: 0.027,    // coach
  drive: 0.17,   // car, 1 occupant
  ferry: 0.02,   // foot passenger
}

// Great-circle distance under-counts real road/rail routing, so ground modes
// carry a detour multiplier; a flight is ~straight-line.
const DETOUR = { flight: 1.0, train: 1.2, bus: 1.2, drive: 1.25, ferry: 1.1 }

// Estimated kg CO₂ for a leg. Null when the mode or distance is unusable, so the
// UI can simply omit the figure rather than show a fake zero.
export function co2Kg(distanceKm, mode) {
  const factor = CO2_FACTORS[mode]
  if (!factor || !(distanceKm > 0)) return null
  return Math.round(distanceKm * (DETOUR[mode] ?? 1.2) * factor)
}

export function co2Label(kg) {
  if (kg == null) return null
  return `~${kg} kg CO₂ est.`
}
