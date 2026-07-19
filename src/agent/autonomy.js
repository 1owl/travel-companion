// Graduated autonomy — L1..L4. Autonomy is per-trip and per-amount, never global,
// and L4 is never the default. This module answers ONE question the runtime asks
// before running a tool: does this action need human confirmation right now?
//
// Principle 3 is absolute: anything financial/irreversible ALWAYS returns a
// confirmation requirement, at EVERY level. L3/L4 only pre-authorise WITHIN a
// bound — they never remove the approval gate for spend.

export const LEVELS = {
  L1: { key: 'L1', name: 'Suggest', blurb: 'The agent proposes; you confirm every change.' },
  L2: { key: 'L2', name: 'Assisted', blurb: 'Reads and non-financial edits run automatically; all spend confirms.' },
  L3: { key: 'L3', name: 'Supervised spend', blurb: 'May prepare bookings up to a per-trip cap; each spend still shows an approval gate.' },
  L4: { key: 'L4', name: 'Pre-authorised', blurb: 'Spend within an explicit per-trip, per-amount grant; irreversible actions still show a short approval gate.' },
}
export const DEFAULT_LEVEL = 'L1'

const ORDER = ['L1', 'L2', 'L3', 'L4']
export const atLeast = (level, min) => ORDER.indexOf(level) >= ORDER.indexOf(min)

// Given a tool's annotations and the active level, decide whether the runtime
// must pause for confirmation before executing. Returns { confirm, reason }.
export function confirmationFor(annotations = {}, level = DEFAULT_LEVEL) {
  if (annotations.financialHint) {
    return { confirm: true, reason: 'Financial or irreversible — always requires approval.' }
  }
  if (annotations.readOnlyHint) {
    return { confirm: false, reason: 'Read-only.' }
  }
  // Non-financial mutation: confirm at L1, auto from L2 up.
  if (!atLeast(level, 'L2')) {
    return { confirm: true, reason: 'Change to your trip — confirm at L1 (Suggest).' }
  }
  return { confirm: false, reason: `Auto-run at ${level}.` }
}

// A non-refundable purchase needs a SECOND, explicit confirmation naming the
// amount and refund status — regardless of level.
export function needsSecondConfirmation(offer) {
  return offer?.refundable === false
}

// Whether a per-trip spend grant covers this amount (L3/L4). The gate still
// shows; this only decides if the grant *could* pre-authorise it.
export function withinGrant(grant, amount, currency) {
  if (!grant || grant.currency !== currency) return false
  return Number(amount) <= Number(grant.remaining ?? grant.cap ?? 0)
}
