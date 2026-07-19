// Structured tool results. Agents recover from errors they can READ, so every
// failure is { code, message, recovery_hint } — never a bare string.

export function ok(data) {
  return { ok: true, data }
}

// code: a stable machine token (see ERROR_CODES). recovery_hint: what the agent
// should try next, in plain language.
export function err(code, message, recovery_hint) {
  return { ok: false, error: { code, message, recovery_hint: recovery_hint || null } }
}

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',   // input failed the Zod schema
  NOT_FOUND: 'NOT_FOUND',                   // trip/booking/offer doesn't exist or isn't yours
  OFFER_EXPIRED: 'OFFER_EXPIRED',           // Duffel offer past its validity window
  PRICE_MOVED: 'PRICE_MOVED',               // re-price differs from what the user approved
  AVAILABILITY_LOST: 'AVAILABILITY_LOST',   // offer no longer bookable
  AUTONOMY_DENIED: 'AUTONOMY_DENIED',       // action needs a higher autonomy grant
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',   // irreversible action reached without confirmation
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',         // Duffel / Places / network
  NOT_SUPPORTED: 'NOT_SUPPORTED',           // capability not available (e.g. Duffel Stays off)
}

// Turn a Zod safeParse error into a structured VALIDATION_FAILED result naming
// the offending fields, so the agent can correct and retry.
export function fromZodError(zerr) {
  const issues = (zerr?.issues || []).map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
  return err('VALIDATION_FAILED', `Invalid parameters — ${issues.join('; ')}`,
    'Fix the named fields and call the tool again.')
}
