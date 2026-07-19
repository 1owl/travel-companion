import { useState, useCallback } from 'react'
import { CopilotKit, useCopilotAction } from '@copilotkit/react-core'
import { CopilotSidebar } from '@copilotkit/react-ui'
import '@copilotkit/react-ui/styles.css'
import { TOOLS } from '../tools/index'
import { buildActionConfig } from './toolActions'
import ApprovalGate from '../ui/ApprovalGate'
import { fmt } from '../../lib/currency'

// The in-app agent runtime (Phase 2). Mounted lazily and only when
// VITE_FEATURE_AGENT === 'true', so the CopilotKit bundle never reaches users
// until this is verified. runtimeUrl points at the CopilotKit runtime endpoint
// (wired to the Anthropic key) — see the deploy notes; without it the sidebar
// loads but the agent can't think.
//
// Transactional tools follow the STATIC generative-UI pattern: the frontend owns
// ApprovalGate/AgentFilledForm; the agent only selects and populates them. It is
// never allowed to emit free-form UI on a spend surface.

// One CopilotKit action per tool (one hook per component — hooks stay top-level).
function ToolAction({ tool, onGated, ctx }) {
  useCopilotAction(buildActionConfig(tool, { ctx, onGated }))
  return null
}

export default function AgentDock({ trip, children }) {
  const runtimeUrl = import.meta.env.VITE_COPILOT_RUNTIME_URL || '/api/copilotkit'
  const [pending, setPending] = useState(null) // { tool, input, retry, resolve }

  // Raised by a gated tool call — shows ApprovalGate and resolves the agent's
  // handler once the user approves (re-running with approval) or declines.
  const onGated = useCallback((tool, input, retry) => new Promise(resolve => {
    setPending({ tool, input, retry, resolve })
  }), [])

  const closeApprove = async (approval) => {
    if (!pending) return
    const res = approval ? await pending.retry(approval) : { ok: false, error: { code: 'DECLINED', message: 'You declined.' } }
    pending.resolve(res.ok ? res.data : { error: res.error })
    setPending(null)
  }

  const ctx = { trip_id: trip?.id, autonomy: 'L1' }
  const amount = pending?.input?.expected_amount ?? null
  const currency = pending?.input?.expected_currency ?? trip?.base_currency ?? 'AUD'

  return (
    <CopilotKit runtimeUrl={runtimeUrl}>
      {TOOLS.map(t => <ToolAction key={t.name} tool={t} onGated={onGated} ctx={ctx} />)}
      <CopilotSidebar
        labels={{
          title: 'Travel assistant',
          initial: trip ? `I can help plan ${trip.name}. Try: “Plan four days in Lyon in October, mid-range, trains not flights.”` : 'How can I help with your trip?',
        }}
      >
        {children}
      </CopilotSidebar>
      {pending &&
        <ApprovalGate
          action={`${pending.tool.name.replace(/_/g, ' ')}${amount != null ? ` — ${fmt(amount, currency)}` : ''}`}
          amount={amount}
          currency={currency}
          refundable={null}
          ifDeclined="Nothing is booked or charged; I’ll ask what you’d like instead."
          onApprove={(a) => closeApprove(a)}
          onDecline={() => closeApprove(null)}
        />}
    </CopilotKit>
  )
}
