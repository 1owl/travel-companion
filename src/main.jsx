import React from 'react'
import { createRoot } from 'react-dom/client'
// HashRouter so the app works on any static host (incl. GitHub Pages project
// sites) without server rewrites — routes live after the URL hash.
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
