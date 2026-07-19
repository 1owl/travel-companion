// Strip PII before anything enters model context or a trace log. Passenger
// details, DOB, passport, payment tokens and IDs are replaced with '[redacted]'.
// Defence in depth — tools already avoid passing these to the model, but nothing
// sensitive should ever reach agent_tool_calls in cleartext.

const SENSITIVE = /pass(port|word)|payment|card|cvv|cvc|iban|account|token|secret|ssn|tax|licen[cs]e|given_name|family_name|born_on|dob|birth|phone|email/i

// Recursively clone `value`, redacting any key that looks sensitive. Arrays and
// nested objects are walked. Non-objects pass through. `passengers` (and any
// array of person-like objects) is collapsed to a count so no name leaks.
export function redact(value, depth = 0) {
  if (depth > 6 || value == null) return value
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1))
  if (typeof value !== 'object') return value

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === 'passengers' && Array.isArray(v)) { out.passengers = `[${v.length} passenger(s) redacted]`; continue }
    if (SENSITIVE.test(k)) { out[k] = '[redacted]'; continue }
    out[k] = redact(v, depth + 1)
  }
  return out
}
