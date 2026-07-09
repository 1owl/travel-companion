import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES, fmt, lineBase as lineToBase, sumBudget } from '../lib/currency'

const blank = { category: 'Accommodation', item: '', qty: 1, unit_price: 0, currency: 'AUD', notes: '' }

export default function BudgetEngine({ tripId, base, travelers, onTotal }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('budget_items').select('*').eq('trip_id', tripId).order('created_at')
    if (error) setErr(error.message); else { setErr(''); setRows(data || []) }
    setLoading(false)
  }, [tripId])
  useEffect(() => { load() }, [load])

  const lineBase = r => lineToBase(r, base)
  const total = sumBudget(rows, base)
  useEffect(() => { onTotal?.(total) }, [total, onTotal])

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('budget_items')
      .insert({ ...form, trip_id: tripId, qty: Number(form.qty) || 1, unit_price: Number(form.unit_price) || 0 })
    if (error) { setErr(error.message); return }
    setErr(''); setForm(blank); load()
  }
  async function update(id, patch) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    const { error } = await supabase.from('budget_items').update(patch).eq('id', id)
    if (error) { setErr(error.message); load() } else setErr('') // revert optimistic state on failure
  }
  async function remove(id) {
    if (!confirm('Delete this budget line?')) return
    await supabase.from('budget_items').delete().eq('id', id); load()
  }

  const cats = {}
  rows.forEach(r => { cats[r.category] = (cats[r.category] || 0) + lineBase(r) })

  return (
    <div>
      <form className="card row-form" onSubmit={add}>
        <input placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Item" value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} required />
        <input type="number" placeholder="Qty" style={{ width: 64 }} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} />
        <input type="number" placeholder="Unit price" style={{ width: 96 }} value={form.unit_price} onChange={e => setForm({ ...form, unit_price: e.target.value })} />
        <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
        <button className="btn primary">Add line</button>
      </form>
      {err && <div className="banner warn">{err}</div>}
      <div className="table-scroll">
      <table className="data">
        <thead><tr><th>Category</th><th>Item</th><th>Qty</th><th>Unit</th><th>Cur</th><th>≈ {base}</th><th></th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td><input className="cell" value={r.category} onChange={e => update(r.id, { category: e.target.value })} /></td>
              <td><input className="cell wide" value={r.item} onChange={e => update(r.id, { item: e.target.value })} /></td>
              <td><input className="mini" type="number" value={r.qty} onChange={e => update(r.id, { qty: Number(e.target.value) || 0 })} /></td>
              <td><input className="mini" type="number" value={r.unit_price} onChange={e => update(r.id, { unit_price: Number(e.target.value) || 0 })} /></td>
              <td><select className="mini" value={r.currency} onChange={e => update(r.id, { currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></td>
              <td className="num">{fmt(lineBase(r), base)}</td>
              <td><button className="btn ghost danger" onClick={() => remove(r.id)}>✕</button></td>
            </tr>
          ))}
          {loading && rows.length === 0 && <tr><td colSpan={7} className="muted">Loading…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={7} className="muted">No budget lines yet — add one above.</td></tr>}
        </tbody>
        <tfoot>
          <tr className="total"><td colSpan={5}>GRAND TOTAL ({base})</td><td className="num">{fmt(total, base)}</td><td></td></tr>
          <tr className="total light"><td colSpan={5}>Per person ({travelers})</td><td className="num">{fmt(total / (travelers || 1), base)}</td><td></td></tr>
        </tfoot>
      </table>
      </div>
      {Object.keys(cats).length > 0 &&
        <div className="card">
          <b>By category</b>
          <ul className="catlist">
            {Object.entries(cats).map(([c, v]) => <li key={c}><span>{c}</span><span>{fmt(v, base)}</span></li>)}
          </ul>
        </div>}
    </div>
  )
}
