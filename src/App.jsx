import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App2.css';
import GlpiLogin from './components/GlpiLogin';
import V5Report from './pages/V5Report';

export default function App() {
  const [hasSession, setHasSession] = useState(null); // null = checking, false = no session

  useEffect(() => {
    (async () => {
      try {
        const _VITE_BACKEND = import.meta.env.VITE_BACKEND_URL || '';
        const _BASE_URL = import.meta.env.BASE_URL || '';
        const BACKEND = (_VITE_BACKEND || _BASE_URL || '').replace(/\/$/, '');
        // First ask backend if it already has a session
        const resp = await axios.get(`${BACKEND}/api/glpi/session`);
        if (resp.data && resp.data.session_token) {
          setHasSession(true);
          return;
        }

        // If backend has no session, try to detect a stored session_token on the client
        // 1) check localStorage
        const tryTokenKeys = ['glpi_session_token', 'session_token', 'glpiSessionToken'];
        let found = null;
        for (const k of tryTokenKeys) {
          const t = localStorage.getItem(k);
          if (t) { found = t; break; }
        }

        // 2) check cookies (if cookie is not HttpOnly)
        if (!found && typeof document !== 'undefined') {
          const getCookie = (name) => {
            const v = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
            return v ? decodeURIComponent(v[1]) : null;
          };
          const cookieNames = ['glpi_session_token', 'session_token', 'glpi_session'];
          for (const c of cookieNames) {
            const v = getCookie(c);
            if (v) { found = v; break; }
          }
        }

        // If we found a token on the client, post it to backend to establish session
        if (found) {
          try {
            await axios.post(`${BACKEND}/api/glpi/session`, { session_token: found }, { withCredentials: true });
            setHasSession(true);
            return;
          } catch (e) {
            // fallthrough to show login
          }
        }

        setHasSession(false);
      } catch (err) {
        setHasSession(false);
      }
    })();
  }, []);

  if (hasSession === false) {
    return <GlpiLogin onSuccess={() => setHasSession(true)} />;
  }

  if (hasSession === null) {
    return <div style={{ padding: 20 }}>Verificando sessão...</div>;
  }

  return <V5Report />;
}
