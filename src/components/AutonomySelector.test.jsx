import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AutonomySelector from './AutonomySelector'

vi.mock('../lib/supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  const { supabase, store } = makeSupabaseMock({
    trips: [{ id: 't1', name: 'France 2026', autonomy_level: 'L1' }],
  })
  return { supabase, __store: store }
})

import { __store } from '../lib/supabase'

const trip = { id: 't1', name: 'France 2026', autonomy_level: 'L1' }

describe('AutonomySelector', () => {
  beforeEach(() => { __store.__failMutations = false })

  it('shows the trip’s current level and all four options', () => {
    render(<AutonomySelector trip={trip} />)
    const select = screen.getByLabelText('Agent autonomy level')
    expect(select.value).toBe('L1')
    const labels = [...select.options].map(o => o.textContent)
    expect(labels).toEqual(['L1 · Suggest', 'L2 · Assisted', 'L3 · Supervised spend', 'L4 · Pre-authorised'])
  })

  it('persists a change to the trips row and notifies the parent', async () => {
    const onChange = vi.fn()
    render(<AutonomySelector trip={trip} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Agent autonomy level'), 'L2')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('L2'))
    expect(__store.trips[0].autonomy_level).toBe('L2')
  })

  it('surfaces a friendly error and does not call onChange when the save fails', async () => {
    __store.__failMutations = true
    const onChange = vi.fn()
    render(<AutonomySelector trip={trip} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText('Agent autonomy level'), 'L3')
    await screen.findByRole('alert')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('falls back to L1 when the trip has no level set', () => {
    render(<AutonomySelector trip={{ id: 't1', name: 'Old trip' }} />)
    expect(screen.getByLabelText('Agent autonomy level').value).toBe('L1')
  })
})
