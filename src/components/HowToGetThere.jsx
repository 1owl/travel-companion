import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { CURRENCIES, fmt } from '../lib/currency'
import { searchJourneys, rankModes, durationLabel, modeLabel } from '../lib/journeys'
import { co2Label } from '../lib/co2'
import { rankOffers, formatDuration } from '../lib/flights'
import { detectNearestAirport } from '../lib/airports'
import { RowsSkeleton } from './Skeleton'
import { StaggerList } from './motion'

const ICON = { flight: '✈', train: '🚆', bus: '🚌', drive: '🚗', ferry: '⛴' }
const TAG_CLASS = { 'Best value': 'jt-value', Fastest: 'jt-fast', Greenest: 'jt-green' }

// "How to get there": compare flight / train / bus / drive for one A→B on given
// dates — duration, price and CO₂, tagged Best value / Fastest / Greenest — then
// add the chosen leg to the booking ledger. Flight prices are live (Duffel);
// ground modes deep-link out and let you type the fare you find (which then
// feeds the budget). No price is ever invented.
export default function HowToGetThere({ tripId, trip }) {
  const base = trip?.base_currency || 'AUD'
  const [form, setForm] = useState({
    from: '',
    to: (trip?.name || '').replace(/\b(19|20)\d{2}\b/g, '').trim(),
    depart_date: trip?.start_date || '',
    adults: trip?.travelers || 1,
  })
  const [res, setRes] = useState(null)       // { options, test, distance_km, origin, destination }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState({})   // { mode: { amount, currency } } — COMMITTED user-entered fares
  const [editing, setEditing] = useState('') // which mode's price field is open
  const [draft, setDraft] = useState({ amount: '', currency: base }) // the field being typed
  const [added, setAdded] = useState({})     // { mode: true } once added to the ledger
  const [weight, setWeight] = useState(1)    // flight expander: cheapest ↔ comfort
  const [showFlights, setShowFlights] = useState(false)

  // Prefill "From" with the nearest airport's city (same as the old Flights tab).
  useEffect(() => {
    let alive = true
    detectNearestAirport().then(a => { if (alive && a) setForm(f => f.from ? f : { ...f, from: a.city }) })
    return () => { alive = false }
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function search(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true); setErr(''); setRes(null); setManual({}); setAdded({}); setEditing(''); setDraft({ amount: '', currency: base })
    const { options, test, distance_km, error } = await searchJourneys({
      origin: form.from, destination: form.to, depart_date: form.depart_date, adults: Number(form.adults) || 1,
    })
    setBusy(false)
    if (error) { setErr(error.message || 'Journey search failed.'); return }
    if (!options.length) { setErr('No ways to get there found. Check the places and try again.'); return }
    setRes({ options, test, distance_km, origin: form.from.trim(), destination: form.to.trim() })
  }

  // Fold any user-entered fares into the options, then tag them.
  const ranked = useMemo(() => {
    if (!res) return []
    const merged = res.options.map(o => {
      const mp = manual[o.mode]
      return (mp && mp.amount !== '' && Number.isFinite(Number(mp.amount)))
        ? { ...o, price: Number(mp.amount), currency: mp.currency || base, user_priced: true }
        : o
    })
    return rankModes(merged, base)
  }, [res, manual, base])

  function startEdit(o) {
    setDraft({ amount: manual[o.mode]?.amount ?? '', currency: manual[o.mode]?.currency ?? base })
    setEditing(o.mode)
  }
  function savePrice() {
    if (draft.amount !== '' && Number.isFinite(Number(draft.amount))) {
      setManual(m => ({ ...m, [editing]: { amount: draft.amount, currency: draft.currency } }))
    }
    setEditing('')
  }

  async function addToLedger(o) {
    const label = modeLabel(o.mode)
    const notes = [
      durationLabel(o.duration_min) && `${durationLabel(o.duration_min)}${o.duration_estimated ? ' est.' : ''}`,
      o.co2_kg != null && `~${o.co2_kg}kg CO₂ est.`,
    ].filter(Boolean).join(' · ') || null
    const { error } = await supabase.from('bookings').insert({
      trip_id: tripId,
      title: `${label} — ${res.origin} → ${res.destination}`,
      category: label,
      date: form.depart_date || null,
      starts_at: form.depart_date || null,
      amount: o.price ?? null,
      currency: o.currency ?? base,
      link: o.deep_link,
      notes,
      status: 'TO BOOK',
    })
    if (error) { setErr(error.message); return }
    setAdded(a => ({ ...a, [o.mode]: true }))
  }

  return (
    <div className="flights">
      <form className="card flights-form" onSubmit={search}>
        <input placeholder="From (city or place)" value={form.from} onChange={e => set('from', e.target.value)} style={{ minWidth: 150 }} required />
        <input placeholder="To (city or place)" value={form.to} onChange={e => set('to', e.target.value)} style={{ minWidth: 150 }} required />
        <label className="f-lbl">Depart<input type="date" value={form.depart_date} onChange={e => set('depart_date', e.target.value)} /></label>
        <input type="number" min="1" max="9" value={form.adults} onChange={e => set('adults', e.target.value)} title="travellers" style={{ width: 64 }} />
        <button className="btn primary" disabled={busy}>{busy ? 'Comparing…' : 'How to get there'}</button>
      </form>
      <p className="muted f-loc">Compare every way to get there — flight, rail, coach, drive. Ground fares aren’t quoted here; open the partner to check, or add the price you find.</p>

      {err && <div className="banner warn">{err}</div>}
      {busy && <RowsSkeleton n={3} />}

      {res && !busy && <>
        {res.test && <div className="banner test-banner">⚠️ TEST DATA — simulated Duffel fares, not bookable. Do not treat flight prices as real.</div>}
        {res.distance_km ? <p className="muted f-loc">≈ {res.distance_km.toLocaleString()} km · {res.origin} → {res.destination}</p> : null}

        <StaggerList className="jrny-grid" key={`${res.origin}|${res.destination}`}>
          {ranked.map(o => (
            <article className="jrny-card card" key={o.mode}>
              <div className="jrny-head">
                <span className="jrny-mode"><span className="jrny-ico" aria-hidden="true">{ICON[o.mode] || '•'}</span>{modeLabel(o.mode)}{o.route ? <span className="muted"> · {o.route}</span> : null}</span>
                <span className="jrny-tags">{o.tags.map(t => <span key={t} className={'jt ' + (TAG_CLASS[t] || '')}>{t}</span>)}</span>
              </div>

              <div className="jrny-facts">
                <span className="num jrny-dur">{durationLabel(o.duration_min) || '—'}{o.duration_estimated ? ' est.' : ''}</span>
                {o.co2_kg != null && <span className="jt jt-green">{co2Label(o.co2_kg)}</span>}
                <span className="jrny-price num">
                  {editing === o.mode
                    ? <span className="jrny-priceedit">
                        <input type="number" min="0" placeholder="fare" value={draft.amount}
                          onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} style={{ width: 84 }} autoFocus />
                        <select value={draft.currency} onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))}>
                          {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <button type="button" className="btn ghost" onClick={savePrice}>Save</button>
                      </span>
                    : o.price != null
                      ? <b onClick={() => o.user_priced && startEdit(o)} style={o.user_priced ? { cursor: 'pointer' } : undefined} title={o.user_priced ? 'Edit price' : undefined}>{fmt(o.price, o.currency)}{o.user_priced ? ' *' : ''}</b>
                      : <button type="button" className="btn ghost jrny-addprice" onClick={() => startEdit(o)}>＋ Add price</button>}
                </span>
              </div>

              <div className="jrny-foot">
                <a className="btn ghost" href={o.deep_link} target="_blank" rel="noreferrer">{o.price != null && !o.user_priced ? 'Book ↗' : 'Check ↗'}</a>
                <button type="button" className="btn primary" disabled={added[o.mode]} onClick={() => addToLedger(o)}>{added[o.mode] ? 'Added ✓' : 'Add to trip'}</button>
                {o.mode === 'flight' && o.offers?.length > 1 &&
                  <button type="button" className="btn ghost" onClick={() => setShowFlights(s => !s)}>{showFlights ? 'Hide flights' : `All ${o.offers.length} flights`}</button>}
              </div>

              {o.mode === 'flight' && showFlights && o.offers?.length > 1 &&
                <div className="jrny-offers">
                  <div className="flights-rank">
                    <span className="muted">Cheapest</span>
                    <input type="range" min="0" max="1" step="0.1" value={weight} onChange={e => setWeight(Number(e.target.value))} aria-label="Cheapest to comfort" />
                    <span className="muted">Most comfortable</span>
                  </div>
                  <table className="data">
                    <thead><tr><th>Airline</th><th>Stops</th><th>Duration</th><th>Price</th></tr></thead>
                    <tbody>
                      {rankOffers(o.offers, weight).map((of, i) => (
                        <tr key={of.id || i}>
                          <td>{of.airline}</td>
                          <td className="num">{of.stops === 0 ? 'Direct' : of.stops}</td>
                          <td className="num">{formatDuration(of.duration)}</td>
                          <td className="num">{fmt(of.price, of.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
            </article>
          ))}
        </StaggerList>
        <p className="muted">Prices marked <b>*</b> are ones you entered. Flight fares are via Duffel and not guaranteed live — confirm at the booking link.</p>
      </>}
    </div>
  )
}
