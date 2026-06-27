import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Auth from './components/Auth'
import Landing from './pages/Landing'
import TripsPage from './pages/TripsPage'
import TripDetail from './pages/TripDetail'

export default function App() {
  const { session, loading } = useAuth()
  return (
    <Routes>
      {/* Public marketing site */}
      <Route path="/" element={<Landing />} />
      {/* App behind auth */}
      <Route path="/app" element={loading ? <Loading /> : session ? <TripsPage /> : <Auth />} />
      <Route path="/app/trip/:id" element={loading ? <Loading /> : session ? <TripDetail /> : <Auth />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

function Loading() {
  return <div className="center muted">Loading…</div>
}
