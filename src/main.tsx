import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { reloadForUpdate } from './lib/chunks'

// A code file from an older deploy couldn't be preloaded: reload onto the current version.
window.addEventListener('vite:preloadError', (e) => { if (reloadForUpdate()) e.preventDefault() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Installable app (PWA): register the service worker in production builds only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
