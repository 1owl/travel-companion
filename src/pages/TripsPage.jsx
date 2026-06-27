import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CURRENCIES } from '../lib/currency'
import { RouteMap, EmptyState } from '../components/Art'
import { TripCardsSkeleton } from '../components/Skeleton'
import { PHOTOS } from '../lib/photos'
import TripCover from '../components/TripCover'
import Discover from '../components/Discover'
import { useDynamicImage } from '../hooks/useDynamicImage'

export default function TripsPage() {
  const { user, signOut } = useAuth()
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const empty = { name: '', start_date: '', end_date: '', travelers: 2, base_currency: 'AUD' }
  const [form, setForm] = useState(empty)
  const hero = useDynamicImage('travel landscape scenic vista', PHOTOS[0].src)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('trips').select('*').order('created_at', { ascending: false })
    if (error) setErr(error.message); else setTrips(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createTrip(e) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.from('trips').insert({
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      travelers: Number(form.travelers) || 1,
    })
    if (error) setErr(error.message)
    else { setForm(empty); load() }
  }
  async function remove(id) {
    if (!confirm('Delete this trip and all its data?')) return
    await supabase.from('trips').delete().eq('id', id); load()
  }

  return (
    <div className="page">
      <header className="topbar">
        <div><b>Travel Companion</b></div>
        <div className="muted">{user?.email} · <a onClick={signOut}>Sign out</a></div>
      </header>
      <main className="container">
        <div className="hero hero-photo" style={{ '--hero-photo': `url(${hero.src})` }}>
          <div className="hero-photo-copy">
            <span className="lp-eyebrow">Welcome back</span>
            <h2>Where to next?</h2>
          </div>
          <RouteMap />
          {hero.author_url &&
            <a className="photo-credit" href={hero.author_url} target="_blank" rel="noreferrer noopener">Photo: {hero.author}</a>}
        </div>

        <Discover />

        <h2>Your trips</h2>
        {err && <div className="banner warn">{err}</div>}
        <form className="card row-form" onSubmit={createTrip}>
          <input placeholder="Trip name (e.g. France 2026)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <input type="number" min="1" style={{ width: 70 }} value={form.travelers}
            onChange={e => setForm({ ...form, travelers: e.target.value })} title="travellers" />
          <select value={form.base_currency} onChange={e => setForm({ ...form, base_currency: e.target.value })}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn primary">Add trip</button>
        </form>
        {loading ? <TripCardsSkeleton /> :
          trips.length === 0 ? <EmptyState kind="trips">No trips yet — create your first above.</EmptyState> :
            <div className="grid">
              {trips.map(t => (
                <div className="card trip" key={t.id}>
                  <TripCover trip={t} />
                  <Link to={`/app/trip/${t.id}`}><h3>{t.name}</h3></Link>
                  <p className="muted">{t.start_date || '—'} → {t.end_date || '—'} · {t.travelers} traveller(s) · {t.base_currency}</p>
                  <div className="actions">
                    <Link className="btn ghost" to={`/app/trip/${t.id}`}>Open</Link>
                    <button className="btn ghost danger" onClick={() => remove(t.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>}
      </main>
    </div>
  )
}
