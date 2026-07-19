// Instrument every tool call from day one. Wraps a tool's execute(), times it,
// and writes a redacted row to agent_tool_calls. Tracing NEVER breaks a tool —
// a logging failure is swallowed.

import { supabase } from '../lib/supabase'
import { redact } from './redact'
import { err } from './_result'

// Small, PII-free summary of a result for the trace store.
function summarize(result) {
  if (!result || typeof result !== 'object') return {}
  if (result.ok) {
    const d = result.data
    const count = Array.isArray(d) ? d.length
      : Array.isArray(d?.results) ? d.results.length
        : Array.isArray(d?.items) ? d.items.length : undefined
    return count == null ? { ok: true } : { ok: true, count }
  }
  return { ok: false, code: result.error?.code }
}

// meta: { tool, transport, autonomy, trip_id }. run: () => Promise<ToolResult>.
export async function withTrace(meta, input, run) {
  const started = nowMs()
  let result
  try {
    result = await run()
  } catch (e) {
    result = err('UPSTREAM_ERROR', e?.message || 'Tool threw unexpectedly.', 'Retry; if it persists the upstream service may be down.')
  }
  const latency_ms = Math.max(0, Math.round(nowMs() - started))
  try {
    await supabase.from('agent_tool_calls').insert({
      trip_id: meta.trip_id ?? input?.trip_id ?? null,
      tool: meta.tool,
      transport: meta.transport || 'in-app',
      autonomy_level: meta.autonomy || 'L1',
      input_redacted: redact(input),
      output_summary: summarize(result),
      status: result.ok ? 'ok' : 'error',
      error_code: result.ok ? null : (result.error?.code || null),
      latency_ms,
    })
  } catch { /* tracing must never break a tool */ }
  return result
}

// Date.now via a tiny indirection so tests can stub if needed.
function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}
