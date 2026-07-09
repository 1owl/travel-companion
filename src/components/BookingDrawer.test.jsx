import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BookingDrawer from './BookingDrawer'

vi.mock('../lib/supabase', async () => {
  const { makeSupabaseMock } = await import('../test/supabaseMock.js')
  return { supabase: makeSupabaseMock({ bookings: [] }).supabase }
})

vi.mock('../lib/attachments', () => ({
  listAttachments: vi.fn(),
  uploadAttachment: vi.fn(),
  signedUrl: vi.fn(),
  removeAttachment: vi.fn(),
  validateFile: vi.fn(() => null),
}))

import * as attach from '../lib/attachments'

const booking = {
  id: 'k1', trip_id: 't1', title: 'Annecy AirBnB',
  vendor: '', confirmation_no: '', starts_at: null, ends_at: null, notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  attach.validateFile.mockReturnValue(null)
})

describe('BookingDrawer attachment vault', () => {
  it('lists existing attachments', async () => {
    attach.listAttachments.mockResolvedValue({
      data: [{ id: 'a1', file_name: 'hotel.pdf', size_bytes: 2048, file_path: 'u/t/a.pdf' }],
      error: null,
    })
    render(<BookingDrawer booking={booking} onClose={() => {}} onSaved={() => {}} />)
    expect(await screen.findByText('hotel.pdf')).toBeInTheDocument()
  })

  it('shows an empty state with no files', async () => {
    attach.listAttachments.mockResolvedValue({ data: [], error: null })
    render(<BookingDrawer booking={booking} onClose={() => {}} onSaved={() => {}} />)
    expect(await screen.findByText(/no files yet/i)).toBeInTheDocument()
  })

  it('uploads a chosen file then reloads the list', async () => {
    attach.listAttachments
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: [{ id: 'a2', file_name: 'ticket.pdf', size_bytes: 100, file_path: 'u/t/b.pdf' }], error: null })
    attach.uploadAttachment.mockResolvedValue({ data: { id: 'a2' }, error: null })

    const { container } = render(<BookingDrawer booking={booking} onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText(/no files yet/i)

    const file = new File(['data'], 'ticket.pdf', { type: 'application/pdf' })
    const input = container.querySelector('input[type=file]')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(attach.uploadAttachment).toHaveBeenCalledTimes(1))
    expect(attach.uploadAttachment.mock.calls[0][0]).toMatchObject({ bookingId: 'k1', tripId: 't1' })
    expect(await screen.findByText('ticket.pdf')).toBeInTheDocument()
  })

  it('closes on Escape (keyboard accessibility)', async () => {
    attach.listAttachments.mockResolvedValue({ data: [], error: null })
    const onClose = vi.fn()
    render(<BookingDrawer booking={booking} onClose={onClose} onSaved={() => {}} />)
    await screen.findByText(/no files yet/i)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('deletes an attachment after confirmation', async () => {
    vi.stubGlobal('confirm', () => true)
    attach.listAttachments.mockResolvedValue({
      data: [{ id: 'a1', file_name: 'hotel.pdf', size_bytes: 2048, file_path: 'u/t/a.pdf' }],
      error: null,
    })
    attach.removeAttachment.mockResolvedValue({ error: null })

    const { container } = render(<BookingDrawer booking={booking} onClose={() => {}} onSaved={() => {}} />)
    await screen.findByText('hotel.pdf')

    const delBtn = container.querySelector('.filelist .btn.danger')
    fireEvent.click(delBtn)
    await waitFor(() => expect(attach.removeAttachment).toHaveBeenCalledTimes(1))
    vi.unstubAllGlobals()
  })
})
