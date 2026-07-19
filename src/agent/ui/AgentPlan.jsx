import { modeLabelForTool } from './labels'

// The agent's intended sequence of tool calls, shown BEFORE execution, with
// per-step cancel. Financial steps are flagged so the user sees spend coming.
//
// Props:
//  steps: [{ id, tool, summary, status?:'pending'|'running'|'done'|'cancelled', financial?:bool }]
//  onCancelStep(id), onRunAll(), onCancelAll()
export default function AgentPlan({ steps = [], onCancelStep, onRunAll, onCancelAll }) {
  const active = steps.filter(s => s.status !== 'cancelled')
  return (
    <div className="ap-plan card">
      <div className="ap-head">
        <b>Here’s my plan</b>
        <span className="muted">{active.length} step{active.length === 1 ? '' : 's'}</span>
      </div>
      <ol className="ap-steps">
        {steps.map((s, i) => (
          <li key={s.id ?? i} className={'ap-step ' + (s.status || 'pending')}>
            <span className="ap-badge">{i + 1}</span>
            <span className="ap-body">
              <span className="ap-tool">
                {modeLabelForTool(s.tool)}
                {s.financial && <span className="ap-fin" title="Spends money or is irreversible">spends money</span>}
              </span>
              <span className="ap-summary muted">{s.summary}</span>
            </span>
            <span className="ap-state">
              {s.status === 'cancelled' ? <span className="muted">cancelled</span>
                : s.status === 'done' ? <span className="ok">✓</span>
                  : s.status === 'running' ? <span className="muted">running…</span>
                    : <button className="btn ghost" onClick={() => onCancelStep?.(s.id)}>Skip</button>}
            </span>
          </li>
        ))}
      </ol>
      <div className="drawer-actions">
        <button className="btn ghost" onClick={onCancelAll}>Cancel all</button>
        <button className="btn primary" onClick={onRunAll} disabled={!active.length}>Run the plan</button>
      </div>
    </div>
  )
}
