import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ApprovalGate from './ApprovalGate'
import AgentFilledForm from './AgentFilledForm'
import AgentPlan from './AgentPlan'
import AgentTrace from './AgentTrace'

describe('ApprovalGate', () => {
  it('shows the action, exact amount and refund status; approve/decline fire', () => {
    const onApprove = vi.fn(), onDecline = vi.fn()
    render(<ApprovalGate action="Book flight MEL→CDG" amount={320} currency="AUD" refundable={true} onApprove={onApprove} onDecline={onDecline} />)
    expect(screen.getByText('Book flight MEL→CDG')).toBeInTheDocument()
    expect(screen.getAllByText(/320/).length).toBeGreaterThan(0) // amount + approve button
    expect(screen.getByText('Refundable')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Decline'))
    expect(onDecline).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(onApprove).toHaveBeenCalledWith({ confirmed: true })
  })

  it('blocks approval of a NON-REFUNDABLE fare until the second confirmation is ticked', () => {
    const onApprove = vi.fn()
    render(<ApprovalGate action="Book" amount={99} currency="EUR" refundable={false} onApprove={onApprove} onDecline={() => {}} />)
    expect(screen.getByText('NON-REFUNDABLE')).toBeInTheDocument()
    const approve = screen.getByRole('button', { name: /approve/i })
    expect(approve).toBeDisabled()
    fireEvent.click(onApprove.mock.calls.length ? approve : approve) // still disabled → no call
    expect(onApprove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(approve).toBeEnabled()
    fireEvent.click(approve)
    expect(onApprove).toHaveBeenCalledWith({ confirmed: true, nonRefundableConfirmed: true })
  })

  it('renders a diff against what the user asked for', () => {
    render(<ApprovalGate action="Book" amount={200} refundable={true} onApprove={() => {}} onDecline={() => {}}
      diff={[{ label: 'Depart', asked: '1 Oct', proposed: '2 Oct' }]} />)
    const row = screen.getByText('Depart').closest('.ag-diff-row')
    expect(within(row).getByText('1 Oct')).toBeInTheDocument()
    expect(within(row).getByText('2 Oct')).toHaveClass('changed')
  })
})

describe('AgentFilledForm', () => {
  const fields = [
    { name: 'city', label: 'City', value: 'Lyon', agentFilled: true },
    { name: 'nights', label: 'Nights', value: '4', agentFilled: true, type: 'number' },
  ]
  it('marks agent-filled fields and returns reviewed values on submit', () => {
    const onSubmit = vi.fn()
    render(<AgentFilledForm title="Confirm stay" fields={fields} onSubmit={onSubmit} />)
    expect(screen.getAllByText('assistant')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onSubmit).toHaveBeenCalledWith({ city: 'Lyon', nights: '4' })
  })
  it('clears the assistant mark on a field the user edits', () => {
    render(<AgentFilledForm fields={fields} onSubmit={() => {}} />)
    const cityInput = screen.getByDisplayValue('Lyon')
    fireEvent.change(cityInput, { target: { value: 'Paris' } })
    expect(screen.getAllByText('assistant')).toHaveLength(1) // only 'nights' still agent-filled
  })
})

describe('AgentPlan', () => {
  const steps = [
    { id: 1, tool: 'search_flights', summary: 'MEL→CDG', status: 'done' },
    { id: 2, tool: 'create_booking', summary: 'book cheapest', financial: true },
  ]
  it('lists steps, flags spend, and wires run/skip', () => {
    const onRunAll = vi.fn(), onCancelStep = vi.fn()
    render(<AgentPlan steps={steps} onRunAll={onRunAll} onCancelStep={onCancelStep} onCancelAll={() => {}} />)
    expect(screen.getByText('Book & pay')).toBeInTheDocument()
    expect(screen.getByText('spends money')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Skip'))               // only the pending step has Skip
    expect(onCancelStep).toHaveBeenCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: /run the plan/i }))
    expect(onRunAll).toHaveBeenCalled()
  })
})

describe('AgentTrace', () => {
  it('is collapsed, opens on click, and surfaces failures', () => {
    render(<AgentTrace calls={[
      { tool: 'search_flights', status: 'ok', latency_ms: 120 },
      { tool: 'get_offer', status: 'error', error_code: 'OFFER_EXPIRED' },
    ]} />)
    expect(screen.getByText(/1 failed/)).toBeInTheDocument()
    expect(screen.queryByText('Re-check price')).not.toBeInTheDocument() // collapsed
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Re-check price')).toBeInTheDocument()
    expect(screen.getByText('OFFER_EXPIRED')).toBeInTheDocument()
  })
})
