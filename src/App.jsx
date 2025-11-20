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
        const BACKEND = import.meta.env.VITE_BACKEND_URL || '';
        const resp = await axios.get(`${BACKEND}/api/glpi/session`);
        if (resp.data && resp.data.session_token) {
          setHasSession(true);
        } else {
          setHasSession(false);
        }
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
