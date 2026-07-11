// Client wrapper for the /parse-confirmation Edge Function.
// The Edge Function sends the confirmation EMAIL text to the Claude API and
// returns strict JSON: { bookings: [ … ] } — one entry per distinct booking it
// finds (a single email can hold several: outbound + return, hotel + transfer).
// This wrapper is defensive: timeout + graceful empty-state, and it tolerates
// malformed model output by coercing to a known prefill shape. It never throws.

import { supabase } from './supabase'

export function emptyPrefill() {
  return {
    title: '', vendor: '', category: '', date: '', start: '', end: '',
    location: '', amount: '', currency: 'AUD', confirmation_no: '', link: '',
  }
}

const scalar = (obj, k) =>
  (typeof obj?.[k] === 'string' || typeof obj?.[k] === 'number') ? String(obj[k]) : ''

// Coerce a single booking object into the strict prefill shape.
export function coerce(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return emptyPrefill() }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return emptyPrefill()
  return {
    title: scalar(obj, 'title'),
    vendor: scalar(obj, 'vendor'),
    category: scalar(obj, 'category'),
    date: scalar(obj, 'date'),
    start: scalar(obj, 'start'),
    end: scalar(obj, 'end'),
    location: scalar(obj, 'location'),
    amount: scalar(obj, 'amount'),
    currency: scalar(obj, 'currency') || 'AUD',
    confirmation_no: scalar(obj, 'confirmation_no'),
    link: scalar(obj, 'link'),
  }
}

// A booking is worth showing if the model actually pulled *something* useful.
const hasSignal = b =>
  !!(b.title || b.vendor || b.amount || b.confirmation_no || b.link || b.date)

// Coerce whatever came back (an object, a { bookings: [...] } wrapper, a bare
// array, or a JSON string of any of those) into a list of prefills.
export function coerceList(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return [] }
  }
  if (!obj || typeof obj !== 'object') return []
  const arr = Array.isArray(obj) ? obj
    : Array.isArray(obj.bookings) ? obj.bookings
      : [obj]
  return arr.map(coerce).filter(hasSignal)
}

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Parse timed out.')), ms))

// supabase-js hides the function's response body behind error.context (a Response)
// on a non-2xx. Dig out the real message so the UI can show WHY it failed
// (e.g. a 503 from the rate-limiter, a 401, or a model error) instead of a
// generic "non-2xx" string.
async function readError(error) {
  const ctx = error?.context
  try {
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json()
      if (body?.error) return { message: body.error, status: ctx.status }
    }
  } catch { /* fall through */ }
  return { message: error?.message || 'Could not reach the parser.', status: ctx?.status }
}

// Returns { bookings: [...], error }. On any failure bookings is [] so the
// caller can fall back to a blank manual form.
export async function parseConfirmation(text, { timeoutMs = 30000 } = {}) {
  if (!text || !text.trim()) {
    return { bookings: [], error: { message: 'No text could be read from that file.' } }
  }
  try {
    const call = supabase.functions.invoke('parse-confirmation', { body: { text } })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { bookings: [], error: await readError(error) }
    return { bookings: coerceList(data), error: null }
  } catch (e) {
    return { bookings: [], error: { message: e?.message || 'Could not parse the confirmation.' } }
  }
}
