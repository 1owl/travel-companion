import { useState } from 'react'
import { modeLabelForTool } from './labels'

// Collapsible post-hoc log of what actually ran — for debugging and user trust.
// Reads the same shape stored in agent_tool_calls (already PII-redacted).
//
// Props:
//  calls: [{ tool, status:'ok'|'error', error_code?, latency_ms?, autonomy_level? }]
export default function AgentTrace({ calls = [] }) {
  const [open, setOpen] = useState(false)
  if (!calls.length) return null
  const failed = calls.filter(c => c.status === 'error').length
  return (
    <div className="at-trace">
      <button className="at-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? '▾' : '▸'} What ran — {calls.length} step{calls.length === 1 ? '' : 's'}
        {failed > 0 && <span className="at-fail"> · {failed} failed</span>}
      </button>
      {open &&
        <ol className="at-list">
          {calls.map((c, i) => (
            <li key={i} className={'at-row ' + c.status}>
              <span className="at-dot" aria-hidden="true">{c.status === 'ok' ? '✓' : '✕'}</span>
              <span className="at-tool">{modeLabelForTool(c.tool)}</span>
              {c.error_code && <span className="at-code">{c.error_code}</span>}
              {c.latency_ms != null && <span className="at-ms num">{Math.round(c.latency_ms)}ms</span>}
              {c.autonomy_level && <span className="muted at-lvl">{c.autonomy_level}</span>}
            </li>
          ))}
        </ol>}
    </div>
  )
}
