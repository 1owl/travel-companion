import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { validateFile, MAX_BYTES, ALLOWED } from './attachments'

function fakeFile(name, { size = 1000, type = '' } = {}) {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('validateFile', () => {
  it('accepts allowed types under the size limit', () => {
    expect(validateFile(fakeFile('hotel.pdf', { size: 5000 }))).toBeNull()
    expect(validateFile(fakeFile('ticket.PNG', { size: 5000 }))).toBeNull()
    expect(validateFile(fakeFile('cal.ics', { size: 100 }))).toBeNull()
  })
  it('rejects oversized files', () => {
    expect(validateFile(fakeFile('big.pdf', { size: MAX_BYTES + 1 }))).toMatch(/too large/i)
  })
  it('rejects unsupported types', () => {
    expect(validateFile(fakeFile('virus.exe'))).toMatch(/unsupported/i)
    expect(validateFile(fakeFile('notes.docx'))).toMatch(/unsupported/i)
  })
  it('rejects nothing selected', () => {
    expect(validateFile(null)).toMatch(/no file/i)
  })
  it('allow-list covers the documented types', () => {
    expect(Object.keys(ALLOWED).sort()).toEqual(['ics', 'jpeg', 'jpg', 'pdf', 'png'])
  })
})
