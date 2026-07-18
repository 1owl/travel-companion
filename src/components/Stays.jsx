import { useEffect, useState, useCallback } from 'react'
import { searchStays, listStayQuotes, saveStayQuote, removeStayQuote } from '../lib/stays'
import { fmt } from '../lib/currency'
import { RowsSkeleton } from './Skeleton'
import { StaggerList } from './motion'

// Live accommodation search via Duffel Stays. Real nightly + total prices, each
// tagged with source + freshness; booking opens on Booking.com (no in-app payment).
export default function Stays({ tripId, trip }) {
  const [form, setForm] = useState({
    place: (trip?.name || '').replace(/\b(19|20)\d{2}\b/g, '').trim(),
    check_in: trip?.start_date || '', check_out: trip?.end_date || '', adults: trip?.travelers || 2,
  })
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [meta, setMeta] = useState({ fetched_at: null, nights: 0, source: null })
  const [saved, setSaved] = useState([])

  const loadSaved = useCallback(async () => {
    const { data } = await listStayQuotes(tripId)
    setSaved(data || [])
  }, [tripId])
  useEffect(() => { loadSaved() }, [loadSaved])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function search(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true); setErr(''); setResults([])
    const { results, fetched_at, nights, source, test, error } = await searchStays({
      place: form.place, check_in: form.check_in, check_out: form.check_out, adults: Number(form.adults) || 2,
    })
    setBusy(false)
    if (error) { setErr(error.message || 'Stay search failed.'); return }
    if (!results.length) { setErr('No stays found for those dates. Try a wider area or different dates.'); return }
    setResults(results); setMeta({ fetched_at, nights, source, test })
  }

  async function save(stay) {
    const { data, error } = await saveStayQuote(trip || { id: tripId }, { ...stay, fetched_at: meta.fetched_at }, form)
    if (!error && data) setSaved(s => [data, ...s])
  }
  async function unsave(q) {
    await removeStayQuote(q.id)
    setSaved(s => s.filter(x => x.id !== q.id))
  }

  return (
    <div className="flights">
      <form className="card flights-form" onSubmit={search}>
        <input placeholder="City or area (e.g. Paris)" value={form.place} onChange={e => set('place', e.target.value)} style={{ minWidth: 180 }} required />
        <label className="f-lbl">Check-in<input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} required /></label>
        <label className="f-lbl">Check-out<input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} required /></label>
        <input type="number" min="1" max="8" value={form.adults} onChange={e => set('adults', e.target.value)} title="guests" style={{ width: 64 }} />
        <button className="btn primary" disabled={busy}>{busy ? 'Searching…' : 'Find stays'}</button>
      </form>

      {err && <div className="banner warn">{err}</div>}
      {busy && <RowsSkeleton n={5} />}

      {results.length > 0 && !busy &&
        <>
          {meta.test && <div className="banner test-banner">⚠️ TEST DATA — simulated Duffel prices, not bookable.</div>}
          <p className="muted f-loc">
            <span className="fresh">
              {meta.source === 'duffel_stays'
                ? `via Duffel Stays · ${meta.nights} night${meta.nights === 1 ? '' : 's'} · fetched ${fmtTime(meta.fetched_at)} · not guaranteed live`
                : `via Google · live prices & booking on Booking.com · ${meta.nights} night${meta.nights === 1 ? '' : 's'}`}
            </span>
          </p>
          <table className="data">
            <thead><tr><th>Hotel</th><th>Rating</th><th>Price</th><th></th></tr></thead>
            <StaggerList as="tbody">
              {results.map((s, i) => (
                <tr key={s.id || i}>
                  <td><b>{s.name}</b>{s.address ? <div className="muted">{s.address}</div> : null}</td>
                  <td className="num">{s.rating ? `${s.rating.toFixed(1)} ★` : (s.review_score != null ? `${s.review_score}/10` : '—')}</td>
                  <td className="num">
                    {s.price != null
                      ? <><b>{fmt(s.price, s.currency)}</b>{s.per_night != null ? <div className="muted">{fmt(s.per_night, s.currency)}/night</div> : null}</>
                      : (s.price_level ? <>{s.price_level} <span className="muted">· check ↗</span></> : <span className="muted">see price ↗</span>)}
                  </td>
                  <td className="nowrap">
                    {s.deep_link && <a className="btn ghost" href={s.deep_link} target="_blank" rel="noreferrer">Book ↗</a>}
                    <button className="btn ghost" onClick={() => save(s)}>Save</button>
                  </td>
                </tr>
              ))}
            </StaggerList>
          </table>
        </>}

      <h3 className="saved-h">Saved stays{saved.length ? ` (${saved.length})` : ''}</h3>
      {saved.length === 0
        ? <p className="muted">Save stays to compare them later — each keeps its price and the time it was fetched.</p>
        : <ul className="saved-list">
          {saved.map(q => (
            <li key={q.id}>
              <span className="saved-name">{q.title}</span>
              <span className="num">{fmt(q.price, q.currency)}</span>
              <span className="fresh">fetched {fmtTime(q.fetched_at)}</span>
              {q.deep_link && <a href={q.deep_link} target="_blank" rel="noreferrer">Book ↗</a>}
              <button className="btn ghost danger" onClick={() => unsave(q)}>✕</button>
            </li>
          ))}
        </ul>}
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(d)
}
