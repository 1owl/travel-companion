import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES } from '../lib/currency'
import { parseConfirmation, emptyPrefill } from '../lib/parseConfirmation'
import { emailToText } from '../lib/emailText'
import { useDialog } from '../hooks/useDialog'

const CATEGORIES = ['Flight', 'Accommodation', 'Train', 'Bus', 'Car hire', 'Ferry', 'Activity', 'Other']

// "Quick add from confirmation": upload a PDF/email or paste text -> Claude (via
// Edge Function) extracts EVERY booking it finds, plus the provider link back to
// each one -> the traveller reviews the pre-filled cards and adds them in one go.
// The model extracts; the user always commits.
export default function QuickAddModal({ tripId, onClose, onSaved }) {
  const [stage, setStage] = useState('input') // 'input' | 'review'
  const [text, setText] = useState('')
  const [images, setImages] = useState([])      // data-URL page images (scanned PDFs / photos)
  const [fileName, setFileName] = useState('')
  const [list, setList] = useState([])          // array of prefill objects under review
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const dialogRef = useDialog(onClose)

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setNote(''); setText(''); setImages([]); setBusy(true)
    const name = file.name.toLowerCase()
    const isPdf = name.endsWith('.pdf')
    const isImage = /\.(png|jpe?g|webp|gif)$/.test(name) || file.type.startsWith('image/')
    try {
      if (isImage) {
        const { imageFileToDataUrl } = await import('../lib/pdfImages')
        setImages([await imageFileToDataUrl(file)])
        setNote('Image ready — click Extract to read the booking with AI.')
      } else if (isPdf) {
        const { extractPdfText } = await import('../lib/pdfText') // lazy: keeps pdfjs out of the initial bundle/tests
        const extracted = await extractPdfText(file)
        if (extracted && extracted.replace(/\s/g, '').length >= 15) {
          setText(extracted)
        } else {
          // No text layer (scanned e-ticket / screenshot-PDF): rasterise the pages
          // and let Claude read them with vision instead of failing.
          const { pdfToImages } = await import('../lib/pdfImages')
          const pages = await pdfToImages(file)
          setImages(pages)
          setNote(pages.length
            ? `Scanned PDF (${pages.length} page${pages.length > 1 ? 's' : ''}) — Extract will read it with AI.`
            : '')
          if (!pages.length) setErr('Could not read that PDF. Please paste the text instead.')
        }
      } else {
        // .eml / .html are often MIME/base64/quoted-printable — decode to readable
        // text (keeping booking URLs) so the parser sees content, not gibberish.
        setText(emailToText(await file.text()))
      }
      setFileName(file.name)
    } catch {
      setFileName(file.name)
      setErr('Could not read that file. You can paste the text instead.')
    }
    setBusy(false)
  }

  async function runParse() {
    setErr(''); setNote(''); setBusy(true)
    const { bookings, error } = await parseConfirmation(
      images.length ? { images } : { text: emailToText(text) })
    setBusy(false)
    if (error) {
      setList([emptyPrefill()])
      // Show the real reason (503 rate-limiter, 401 sign-in, model error) so a
      // silent empty form doesn't look like "nothing was found".
      setNote(`Auto-parse unavailable: ${error.message} — review and fill manually.`)
    } else if (!bookings.length) {
      setList([emptyPrefill()])
      setNote('No booking details detected — fill the fields manually.')
    } else {
      setList(bookings)
      setNote(bookings.length > 1
        ? `Found ${bookings.length} bookings in this confirmation — review and add.`
        : 'Details extracted — review and add.')
    }
    setStage('review')
  }

  function skipToManual() {
    setList([emptyPrefill()]); setNote(''); setImages([]); setStage('review')
  }

  const setField = (i, k, v) => setList(l => l.map((b, j) => j === i ? { ...b, [k]: v } : b))
  const removeAt = i => setList(l => l.filter((_, j) => j !== i))
  const addBlank = () => setList(l => [...l, emptyPrefill()])

  // 'YYYY-MM-DD' or full ISO -> stored as-is (timestamptz); blank -> null.
  const ts = v => (v && v.trim()) ? v.trim() : null

  async function save() {
    setErr('')
    const rows = list.filter(b => b.title.trim())
    if (!rows.length) { setErr('Give at least one booking a title.'); return }
    setBusy(true)
    const payload = rows.map(b => ({
      trip_id: tripId,
      title: b.title.trim(),
      vendor: b.vendor || null,
      category: b.category || null,
      date: b.date || null,
      amount: b.amount === '' ? null : Number(b.amount),
      currency: b.currency || 'AUD',
      confirmation_no: b.confirmation_no || null,
      link: b.link || null,
      starts_at: ts(b.start),
      ends_at: ts(b.end),
      notes: b.location ? `Location: ${b.location}` : null,
      status: 'BOOKED',
    }))
    const { error } = await supabase.from('bookings').insert(payload)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    onClose()
  }

  const addable = list.filter(b => b.title.trim()).length

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Quick add from confirmation">
        <header className="drawer-head">
          <b>Quick add from confirmation</b>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {stage === 'input' ? (
          <div className="drawer-body">
            <p className="muted">Upload a confirmation PDF, a screenshot/photo of a ticket, or paste the whole email. We’ll pull out every booking — dates, price, confirmation number and the link back to the provider — for you to confirm. Scanned or image-only PDFs are read with AI. Nothing is saved automatically.</p>
            <label className="btn ghost filebtn">
              {fileName || 'Choose a PDF / image / .eml / .html / .txt'}
              <input type="file" hidden accept=".pdf,.ics,.txt,.eml,.html,.htm,.png,.jpg,.jpeg,.webp,image/*" onChange={onPickFile} />
            </label>
            <textarea
              rows={8} placeholder="…or paste the confirmation email here"
              value={text} onChange={e => { setText(e.target.value); if (images.length) setImages([]) }}
            />
            {note && <div className="banner">{note}</div>}
            {err && <div className="banner warn">{err}</div>}
            <div className="drawer-actions">
              <button className="btn primary" onClick={runParse} disabled={busy || (!text.trim() && !images.length)}>
                {busy ? 'Reading…' : images.length ? 'Extract from image' : 'Extract bookings'}
              </button>
              <button className="btn ghost" onClick={skipToManual} disabled={busy}>Enter manually</button>
            </div>
          </div>
        ) : (
          <div className="drawer-body">
            {note && <div className="banner">{note}</div>}
            {list.map((b, i) => (
              <div className="qa-card" key={i}>
                {list.length > 1 &&
                  <div className="qa-card-head">
                    <span className="muted">Booking {i + 1}</span>
                    <button className="btn ghost danger" onClick={() => removeAt(i)} aria-label={`Remove booking ${i + 1}`}>Remove</button>
                  </div>}
                <label>Title
                  <input value={b.title} onChange={e => setField(i, 'title', e.target.value)} placeholder="e.g. Hotel — Paris" />
                </label>
                <div className="row2">
                  <label>Vendor
                    <input value={b.vendor} onChange={e => setField(i, 'vendor', e.target.value)} />
                  </label>
                  <label>Category
                    <select value={b.category} onChange={e => setField(i, 'category', e.target.value)}>
                      <option value="">—</option>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <div className="row2">
                  <label>Date
                    <input value={b.date} onChange={e => setField(i, 'date', e.target.value)} placeholder="e.g. 31 Aug" />
                  </label>
                  <label>Confirmation #
                    <input value={b.confirmation_no} onChange={e => setField(i, 'confirmation_no', e.target.value)} />
                  </label>
                </div>
                <label>Location / route
                  <input value={b.location} onChange={e => setField(i, 'location', e.target.value)} placeholder="e.g. Nice, France or LHR → CDG" />
                </label>
                <div className="row2">
                  <label>Amount
                    <input type="number" value={b.amount} onChange={e => setField(i, 'amount', e.target.value)} />
                  </label>
                  <label>Currency
                    <select value={b.currency} onChange={e => setField(i, 'currency', e.target.value)}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <label>Booking link
                  <input value={b.link} onChange={e => setField(i, 'link', e.target.value)} placeholder="https://…  (opens the booking on the provider’s site)" />
                </label>
                {b.link &&
                  <a className="qa-linkpreview" href={b.link} target="_blank" rel="noreferrer">Open this booking ↗</a>}
              </div>
            ))}
            <button className="btn ghost" onClick={addBlank}>＋ Add another booking</button>
            {err && <div className="banner warn">{err}</div>}
            <div className="drawer-actions">
              <button className="btn ghost" onClick={() => setStage('input')}>← Back</button>
              <button className="btn primary" onClick={save} disabled={busy || !addable}>
                {busy ? 'Saving…' : addable > 1 ? `Add ${addable} bookings` : 'Add booking'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
