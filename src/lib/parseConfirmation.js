// Client wrapper for the /parse-confirmation Edge Function (Phase 1 quick-add).
// The Edge Function (deferred until an Anthropic key is configured) sends the
// confirmation TEXT to the Claude API and returns strict JSON. This wrapper is
// defensive: timeout + graceful empty-state, and it tolerates malformed model
// output by coercing to a known prefill shape. It never throws to the UI.

import { supabase } from './supabase'

export function emptyPrefill() {
  return { title: '', vendor: '', date: '', amount: '', currency: 'AUD', confirmation_no: '' }
}

// Coerce whatever came back (object, JSON string, or junk) into the strict
// prefill shape. Unknown/missing fields fall back to empty.
export function coerce(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return emptyPrefill() }
  }
  if (!obj || typeof obj !== 'object') return emptyPrefill()
  const pick = k => (typeof obj[k] === 'string' || typeof obj[k] === 'number') ? String(obj[k]) : ''
  return {
    title: pick('title'),
    vendor: pick('vendor'),
    date: pick('date'),
    amount: pick('amount'),
    currency: pick('currency') || 'AUD',
    confirmation_no: pick('confirmation_no'),
  }
}

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Parse timed out.')), ms))

export async function parseConfirmation(text, { timeoutMs = 20000 } = {}) {
  if (!text || !text.trim()) {
    return { data: emptyPrefill(), error: { message: 'No text could be read from that file.' } }
  }
  try {
    const call = supabase.functions.invoke('parse-confirmation', { body: { text } })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { data: emptyPrefill(), error }
    return { data: coerce(data), error: null }
  } catch (e) {
    return { data: emptyPrefill(), error: { message: e?.message || 'Could not parse the confirmation.' } }
  }
}
