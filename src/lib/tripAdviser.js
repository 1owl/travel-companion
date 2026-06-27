// Client wrapper for the trip-adviser Edge Function — the web-grounded research
// engine. Long timeout (it runs several searches), graceful empty on failure.
import { supabase } from './supabase'

const timeout = ms => new Promise((_, reject) =>
  setTimeout(() => reject(new Error('The adviser timed out — try again.')), ms))

export async function researchTrip({ input = {}, prompt = '' } = {}, { timeoutMs = 175000 } = {}) {
  try {
    const call = supabase.functions.invoke('trip-adviser', { body: { input, prompt } })
    const { data, error } = await Promise.race([call, timeout(timeoutMs)])
    if (error) return { result: null, grounded: false, error }
    if (data?.error) return { result: null, grounded: false, error: { message: data.error } }
    return { result: data?.result || null, grounded: !!data?.grounded, fetched_at: data?.fetched_at || null, error: null }
  } catch (e) {
    return { result: null, grounded: false, error: { message: e?.message || 'Adviser unavailable.' } }
  }
}
