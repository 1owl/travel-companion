import { useState } from 'react'

// A form the agent has pre-populated. EVERY agent-supplied field is visually
// marked and individually editable — the user is never asked to trust a field
// they can't see. Used for transactional surfaces (static generative UI): the
// frontend owns this component; the agent only supplies values.
//
// Props:
//  title
//  fields: [{ name, label, value, type?, options?, agentFilled?:bool, help? }]
//  submitLabel
//  onSubmit(values) — the reviewed values
//  onCancel()
export default function AgentFilledForm({ title, fields = [], submitLabel = 'Confirm', onSubmit, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.name, f.value ?? ''])))
  const [touched, setTouched] = useState({}) // fields the user edited (agent mark clears)

  const set = (name, v) => { setValues(s => ({ ...s, [name]: v })); setTouched(t => ({ ...t, [name]: true })) }

  return (
    <form className="af-form card" onSubmit={e => { e.preventDefault(); onSubmit?.(values) }}>
      {title && <h4 className="af-title">{title}</h4>}
      {fields.map(f => {
        const byAgent = f.agentFilled && !touched[f.name]
        return (
          <label className="af-field" key={f.name}>
            <span className="af-label">
              {f.label}
              {byAgent && <span className="af-badge" title="Filled by the assistant — check it">assistant</span>}
            </span>
            {f.type === 'select'
              ? <select value={values[f.name]} onChange={e => set(f.name, e.target.value)} className={byAgent ? 'af-byagent' : ''}>
                  {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              : <input
                  type={f.type || 'text'} value={values[f.name]}
                  onChange={e => set(f.name, e.target.value)}
                  className={byAgent ? 'af-byagent' : ''} />}
            {f.help && <span className="af-help muted">{f.help}</span>}
          </label>
        )
      })}
      <div className="drawer-actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn primary">{submitLabel}</button>
      </div>
    </form>
  )
}
