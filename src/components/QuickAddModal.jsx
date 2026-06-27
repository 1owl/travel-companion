import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES } from '../lib/currency'
import { parseConfirmation, emptyPrefill } from '../lib/parseConfirmation'

// "Quick add from confirmation": upload a PDF or paste text -> best-effort parse
// (Claude, via Edge Function) -> review a PRE-FILLED form -> user saves. The model
// extracts; the user always commits. Parsing degrades gracefully to manual entry.
export default function QuickAddModal({ tripId, onClose, onSaved }) {
  const [stage, setStage] = useState('input') // 'input' | 'review'
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [prefill, setPrefill] = useState(emptyPrefill())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setFileName(file.name); setBusy(true)
    try {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const { extractPdfText } = await import('../lib/pdfText') // lazy: keeps pdfjs out of the initial bundle/tests
        setText(await extractPdfText(file))
      } else {
        setText(await file.text())
      }
    } catch {
      setErr('Could not read that file. You can paste the text instead.')
    }
    setBusy(false)
  }

  async function runParse() {
    setErr(''); setNote(''); setBusy(true)
    const { data, error } = await parseConfirmation(text)
    setBusy(false)
    setPrefill(data) // empty prefill on failure — user fills manually
    if (error) setNote('Auto-parse unavailable — review and fill the fields manually.')
    setStage('review')
  }

  function skipToManual() {
    setPrefill(emptyPrefill())
    setNote('')
    setStage('review')
  }

  async function save() {
    setErr('')
    if (!prefill.title.trim()) { setErr('Title is required.'); return }
    setBusy(true)
    const { error } = await supabase.from('bookings').insert({
      trip_id: tripId,
      title: prefill.title,
      vendor: prefill.vendor || null,
      date: prefill.date || null,
      amount: prefill.amount === '' ? null : Number(prefill.amount),
      currency: prefill.currency || 'AUD',
      confirmation_no: prefill.confirmation_no || null,
      status: 'BOOKED',
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved?.()
    onClose()
  }

  const set = (k, v) => setPrefill(p => ({ ...p, [k]: v }))

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Quick add from confirmation">
        <header className="drawer-head">
          <b>Quick add from confirmation</b>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {stage === 'input' ? (
          <div className="drawer-body">
            <p className="muted">Upload a confirmation PDF or paste the email text. We’ll extract the details for you to confirm — nothing is saved automatically.</p>
            <label className="btn ghost filebtn">
              {fileName || 'Choose a PDF / .ics / .txt'}
              <input type="file" hidden accept=".pdf,.ics,.txt,.eml" onChange={onPickFile} />
            </label>
            <textarea
              rows={7} placeholder="…or paste the confirmation text here"
              value={text} onChange={e => setText(e.target.value)}
            />
            {err && <div className="banner warn">{err}</div>}
            <div className="drawer-actions">
              <button className="btn primary" onClick={runParse} disabled={busy || !text.trim()}>
                {busy ? 'Reading…' : 'Parse'}
              </button>
              <button className="btn ghost" onClick={skipToManual} disabled={busy}>Enter manually</button>
            </div>
          </div>
        ) : (
          <div className="drawer-body">
            {note && <div className="banner">{note}</div>}
            <label>Title
              <input value={prefill.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Hotel — Paris" />
            </label>
            <label>Vendor
              <input value={prefill.vendor} onChange={e => set('vendor', e.target.value)} />
            </label>
            <div className="row2">
              <label>Date
                <input value={prefill.date} onChange={e => set('date', e.target.value)} placeholder="e.g. 31 Aug" />
              </label>
              <label>Confirmation #
                <input value={prefill.confirmation_no} onChange={e => set('confirmation_no', e.target.value)} />
              </label>
            </div>
            <div className="row2">
              <label>Amount
                <input type="number" value={prefill.amount} onChange={e => set('amount', e.target.value)} />
              </label>
              <label>Currency
                <select value={prefill.currency} onChange={e => set('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {err && <div className="banner warn">{err}</div>}
            <div className="drawer-actions">
              <button className="btn ghost" onClick={() => setStage('input')}>← Back</button>
              <button className="btn primary" onClick={save} disabled={busy}>Save booking</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
