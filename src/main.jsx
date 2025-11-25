import React from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import App from './App'
import './pages/V5Report.css'
import clientLogger from './utils/clientLogger'

// ensure axios sends cookies for all requests by default (session persistence)
axios.defaults.withCredentials = true;

// (DEV API key injection removed)

// initialize client-side logger to send console/errors to backend
try {
  clientLogger.init({ source: 'frontend' });
} catch (e) {
  // suppressed: clientLogger init failed
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
