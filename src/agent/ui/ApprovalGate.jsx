import { useState } from 'react'
import { fmt } from '../../lib/currency'

// Blocking gate for irreversible actions. Shows the action, the EXACT amount,
// refund/change status, what happens if declined, and a diff against what the
// user originally asked for. Non-refundable purchases require a second, explicit
// confirmation naming the amount and refund status (Principle 3).
//
// Pure + framework-agnostic so it's fully testable; the CopilotKit bridge renders
// it via renderAndWaitForResponse and maps the callbacks to the agent.
//
// Props:
//  action        — short label, e.g. 'Book flight MEL→CDG'
//  amount, currency — the exact spend (or null for non-financial irreversibles)
//  refundable    — true | false | null(unknown)
//  ifDeclined    — one line: what happens if they decline
//  diff          — [{ label, asked, proposed }] vs the original request (optional)
//  onApprove(payload) — payload.confirmed = true, plus nonRefundableConfirmed when applicable
//  onDecline(), onEdit()
export default function ApprovalGate({
  action, amount = null, currency = 'AUD', refundable = null,
  ifDeclined = 'Nothing is booked or charged.', diff = [], onApprove, onDecline, onEdit,
}) {
  const nonRefundable = refundable === false
  const [ack, setAck] = useState(false)
  const canApprove = !nonRefundable || ack

  const refundLabel = refundable === true ? 'Refundable'
    : refundable === false ? 'NON-REFUNDABLE'
      : 'Refund status unknown'
  const refundClass = refundable === true ? 'ok' : refundable === false ? 'danger' : 'muted'

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Confirm action">
      <div className="modal ag-gate" onClick={e => e.stopPropagation()}>
        <header className="drawer-head">
          <b>Confirm before we continue</b>
        </header>
        <div className="drawer-body">
          <p className="ag-action">{action}</p>

          {amount != null &&
            <div className="ag-amount">
              <span className="ag-amount-num num">{fmt(amount, currency)}</span>
              <span className={'ag-refund ' + refundClass}>{refundLabel}</span>
            </div>}

          {diff.length > 0 &&
            <div className="ag-diff">
              <div className="ag-diff-h">Versus what you asked for</div>
              {diff.map((d, i) => (
                <div className="ag-diff-row" key={i}>
                  <span className="ag-diff-label">{d.label}</span>
                  <span className="ag-diff-asked">{d.asked}</span>
                  <span className="ag-diff-arrow" aria-hidden="true">→</span>
                  <span className={'ag-diff-prop' + (String(d.asked) !== String(d.proposed) ? ' changed' : '')}>{d.proposed}</span>
                </div>
              ))}
            </div>}

          <p className="ag-declined muted">If you decline: {ifDeclined}</p>

          {nonRefundable &&
            <label className="ag-ack">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              <span>I understand this is <b>non-refundable</b>{amount != null ? <> at <b>{fmt(amount, currency)}</b></> : ''} and cannot be undone.</span>
            </label>}

          <div className="drawer-actions">
            <button className="btn ghost" onClick={onDecline}>Decline</button>
            {onEdit && <button className="btn ghost" onClick={onEdit}>Edit first</button>}
            <button
              className="btn primary"
              disabled={!canApprove}
              onClick={() => onApprove?.({ confirmed: true, ...(nonRefundable ? { nonRefundableConfirmed: true } : {}) })}
            >
              {amount != null ? `Approve ${fmt(amount, currency)}` : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
