import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LEVELS } from '../agent/autonomy'

// Per-trip graduated autonomy selector (agentic layer). L1 is the safe default;
// financial tools ALWAYS require approval regardless of level — the level only
// governs how much non-financial work the agent may do unprompted.
// Rendered only when the agent feature flag is on (TripDetail gates it).
export default function AutonomySelector({ trip, onChange }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const level = trip?.autonomy_level || 'L1'

  async function choose(e) {
    const next = e.target.value
    if (!LEVELS[next] || next === level) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('trips')
      .update({ autonomy_level: next })
      .eq('id', trip.id)
    setSaving(false)
    if (err) { setError('Could not save autonomy level.'); return }
    onChange?.(next)
  }

  return (
    <label className="autonomy-picker" title={LEVELS[level]?.blurb}>
      <span className="muted">Agent autonomy</span>
      <select
        aria-label="Agent autonomy level"
        value={level}
        onChange={choose}
        disabled={saving}
      >
        {Object.values(LEVELS).map(l =>
          <option key={l.key} value={l.key}>{l.key} · {l.name}</option>)}
      </select>
      {error && <span className="muted" role="alert">{error}</span>}
    </label>
  )
}
