import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { hasSupabaseConfig } from '../lib/supabase'
import { RouteMap } from './Art'

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const fn = mode === 'signin' ? signIn : signUp
    const { error } = await fn(email, password)
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'signup') setMsg('Account created — check your email to confirm, then sign in.')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <RouteMap className="auth-hero" />
        <h1>Travel Companion</h1>
        <p className="muted">Plan · book · track · budget — all in one place.</p>
        {!hasSupabaseConfig &&
          <div className="banner warn">Supabase isn’t configured. Add your keys to <code>.env</code> and restart.</div>}
        <form onSubmit={submit} className="stack">
          <label>Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? '…' : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        {msg && <p className="msg">{msg}</p>}
        <p className="switch muted">
          {mode === 'signin' ? "No account? " : "Have an account? "}
          <a onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg('') }}>
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </a>
        </p>
      </div>
    </div>
  )
}
