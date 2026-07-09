import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  listAttachments, uploadAttachment, signedUrl, removeAttachment, validateFile,
} from '../lib/attachments'
import { useDialog } from '../hooks/useDialog'

// Slide-over detail panel for a single booking: editable trip-detail fields +
// the attachment vault (upload / list / download / delete).
export default function BookingDrawer({ booking, onClose, onSaved }) {
  const [form, setForm] = useState({
    vendor: booking.vendor || '',
    confirmation_no: booking.confirmation_no || '',
    starts_at: toLocalInput(booking.starts_at),
    ends_at: toLocalInput(booking.ends_at),
    notes: booking.notes || '',
  })
  const [savedMsg, setSavedMsg] = useState('')
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)
  const dialogRef = useDialog(onClose)

  const loadFiles = useCallback(async () => {
    const { data, error } = await listAttachments(booking.id)
    if (error) setErr(error.message); else setFiles(data || [])
  }, [booking.id])
  useEffect(() => { loadFiles() }, [loadFiles])

  async function save() {
    setErr(''); setSavedMsg('')
    const patch = {
      vendor: form.vendor || null,
      confirmation_no: form.confirmation_no || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      notes: form.notes || null,
    }
    const { error } = await supabase.from('bookings').update(patch).eq('id', booking.id)
    if (error) { setErr(error.message); return }
    setSavedMsg('Saved')
    onSaved?.({ ...booking, ...patch })
  }

  async function handleFiles(fileList) {
    setErr('')
    const incoming = Array.from(fileList || [])
    if (incoming.length === 0) return
    setBusy(true)
    for (const file of incoming) {
      const bad = validateFile(file)
      if (bad) { setErr(bad); continue }
      const { error } = await uploadAttachment({ file, tripId: booking.trip_id, bookingId: booking.id })
      if (error) setErr(error.message)
    }
    setBusy(false)
    loadFiles()
  }

  async function download(att) {
    const { data, error } = await signedUrl(att.file_path, 60)
    if (error) { setErr(error.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function del(att) {
    if (!confirm(`Delete "${att.file_name}"?`)) return
    const { error } = await removeAttachment(att)
    if (error) setErr(error.message); else loadFiles()
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside ref={dialogRef} tabIndex={-1} className="drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Booking details">
        <header className="drawer-head">
          <b>{booking.title}</b>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="drawer-body">
          <label>Vendor
            <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
          </label>
          <label>Confirmation #
            <input value={form.confirmation_no} onChange={e => setForm({ ...form, confirmation_no: e.target.value })} />
          </label>
          <div className="row2">
            <label>Check-in
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label>Check-out
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} />
            </label>
          </div>
          <label>Notes
            <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="drawer-actions">
            <button className="btn primary" onClick={save}>Save details</button>
            {savedMsg && <span className="saved">{savedMsg}</span>}
          </div>

          <h4>Attachments</h4>
          <div
            className={'dropzone' + (dragOver ? ' over' : '')}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Uploading…' : 'Drag a PDF / image / .ics here, or click to choose'}
            <input
              ref={inputRef} type="file" hidden multiple
              accept=".pdf,.png,.jpg,.jpeg,.ics"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {err && <div className="banner warn">{err}</div>}

          <ul className="filelist">
            {files.map(f => (
              <li key={f.id}>
                <span className="fname" title={f.file_name}>{f.file_name}</span>
                <span className="fsize">{prettyBytes(f.size_bytes)}</span>
                <button className="btn ghost" onClick={() => download(f)}>Download</button>
                <button className="btn ghost danger" onClick={() => del(f)}>✕</button>
              </li>
            ))}
            {files.length === 0 && <li className="muted">No files yet — add your confirmation above.</li>}
          </ul>
        </div>
      </aside>
    </div>
  )
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function prettyBytes(n) {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
