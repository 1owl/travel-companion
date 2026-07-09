import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES, toBase, fmt } from '../lib/currency'
import { removeAttachmentsForBooking } from '../lib/attachments'
import { statusClass } from '../lib/status'
import { EmptyState } from './Art'
import BookingDrawer from './BookingDrawer'
import QuickAddModal from './QuickAddModal'

const STATUSES = ['TO BOOK', 'BOOKED', 'OPTIONAL', 'CHECK']
const blank = { title: '', category: 'Accommodation', date: '', status: 'TO BOOK', amount: '', currency: 'AUD', paid: false, link: '', notes: '' }

export default function BookingLedger({ tripId, base, onTotal }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  const [openBooking, setOpenBooking] = useState(null)
  const [quickAdd, setQuickAdd] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('bookings').select('*').eq('trip_id', tripId).order('created_at')
    if (error) setErr(error.message); else { setErr(''); setRows(data || []) }
    setLoading(false)
  }, [tripId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const total = rows.reduce((s, r) => s + toBase(r.amount, r.currency, base), 0)
    onTotal?.(total)
  }, [rows, base, onTotal])

  async function add(e) {
    e.preventDefault()
    const payload = { ...form, trip_id: tripId, amount: form.amount === '' ? null : Number(form.amount) }
    const { error } = await supabase.from('bookings').insert(payload)
    if (error) { setErr(error.message); return }
    setErr(''); setForm(blank); load()
  }
  async function update(id, patch) {
    let updated
    setRows(rs => rs.map(r => { if (r.id === id) { updated = { ...r, ...patch }; return updated } return r }))
    const { error } = await supabase.from('bookings').update(patch).eq('id', id)
    if (error) { setErr(error.message); load(); return } // revert optimistic state
    setErr('')
    // Closing the loop: when something is marked BOOKED, open its drawer so the
    // traveller can attach the confirmation (Phase 1 vault).
    if (patch.status === 'BOOKED' && updated) setOpenBooking(updated)
  }
  async function remove(id) {
    if (!confirm('Delete this booking and its attachments? This cannot be undone.')) return
    // Clear Storage objects first — the DB cascade only removes attachment rows.
    await removeAttachmentsForBooking(id)
    await supabase.from('bookings').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="toolbar">
        <button className="btn ghost" onClick={() => setQuickAdd(true)}>＋ Quick add from confirmation</button>
      </div>
      <form className="card row-form" onSubmit={add}>
        <input placeholder="What to book" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        <input placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
        <input type="number" placeholder="Cost" style={{ width: 90 }} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
        <input placeholder="Link (optional)" value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} />
        <button className="btn primary">Add</button>
      </form>
      {err && <div className="banner warn">{err}</div>}
      <div className="table-scroll">
      <table className="data">
        <thead><tr><th>What</th><th>Category</th><th>Date</th><th>Status</th><th>Cost</th><th>≈ {base}</th><th>Paid</th><th></th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.link ? <a href={r.link} target="_blank" rel="noreferrer">{r.title}</a> : r.title}</td>
              <td>{r.category}</td>
              <td>{r.date || '—'}</td>
              <td>
                <select className={'st ' + statusClass(r.status)} value={r.status} onChange={e => update(r.id, { status: e.target.value })}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td className="nowrap">
                <input className="mini" type="number" value={r.amount ?? ''} onChange={e => update(r.id, { amount: e.target.value === '' ? null : Number(e.target.value) })} />
                <select className="mini" value={r.currency} onChange={e => update(r.id, { currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
              </td>
              <td className="num">{fmt(toBase(r.amount, r.currency, base), base)}</td>
              <td style={{ textAlign: 'center' }}><input type="checkbox" checked={r.paid} onChange={e => update(r.id, { paid: e.target.checked })} /></td>
              <td className="nowrap">
                <button className="btn ghost" onClick={() => setOpenBooking(r)}>Details</button>
                <button className="btn ghost danger" onClick={() => remove(r.id)}>✕</button>
              </td>
            </tr>
          ))}
          {loading && rows.length === 0 && <tr><td colSpan={8} className="muted">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={8}><EmptyState kind="bookings">No bookings yet — add one above.</EmptyState></td></tr>}
        </tbody>
      </table>
      </div>

      {openBooking &&
        <BookingDrawer
          booking={openBooking}
          onClose={() => setOpenBooking(null)}
          onSaved={() => load()}
        />}
      {quickAdd &&
        <QuickAddModal
          tripId={tripId}
          onClose={() => setQuickAdd(false)}
          onSaved={() => load()}
        />}
    </div>
  )
}
