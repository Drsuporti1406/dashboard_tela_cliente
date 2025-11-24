import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App2.css';
import V5Report from './pages/V5Report';

export default function App() {
  // authChecked: concluímos verificação do token principal (SSO) vindo do helpcentral_front
  const [authChecked, setAuthChecked] = useState(false);
  const [glpiReady, setGlpiReady] = useState(false); // opcional: GLPI session estabelecida

  // Verifica se existe token de autenticação gerado pelo helpcentral_front
  useEffect(() => {
    const token = (() => {
      try { return localStorage.getItem('token'); } catch (e) { return null; }
    })();
    if (!token) {
      // Sem token compartilhado -> redireciona para a tela de login central
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in';
      }
      return;
    }
    setAuthChecked(true);
  }, []);

  // Estabelece sessão GLPI reutilizando qualquer session_token já existente (sem UI de login)
  useEffect(() => {
    if (!authChecked) return; // aguarda SSO
    (async () => {
      try {
        const _VITE_BACKEND = import.meta.env.VITE_BACKEND_URL || '';
        const _BASE_URL = import.meta.env.BASE_URL || '';
        const BACKEND = (_VITE_BACKEND || _BASE_URL || '').replace(/\/$/, '');

        // Verifica se backend já tem sessão
        const existing = await axios.get(`${BACKEND}/api/glpi/session`);
        if (existing.data && existing.data.session_token) {
          setGlpiReady(true);
          return;
        }

        // Busca tokens locais
        const tryTokenKeys = ['glpi_session_token', 'session_token', 'glpiSessionToken'];
        let found = null;
        for (const k of tryTokenKeys) {
          try {
            const t = localStorage.getItem(k);
            if (t) { found = t; break; }
          } catch (e) {}
        }

        // Cookies não HttpOnly (fallback)
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

        if (found) {
          try {
            await axios.post(`${BACKEND}/api/glpi/session`, { session_token: found }, { withCredentials: true });
            setGlpiReady(true);
            return;
          } catch (e) {
            // Ignora falha; dashboard continuará sem sessão GLPI (algumas chamadas podem falhar)
          }
        }

        // Se não achou token GLPI, segue adiante; a interface mostrará erros de API conforme necessário
        setGlpiReady(false);
      } catch (err) {
        setGlpiReady(false);
      }
    })();
  }, [authChecked]);

  if (!authChecked) {
    return <div style={{ padding: 20 }}>Verificando autenticação...</div>;
  }

  // Não bloqueamos a UI se GLPI não estiver pronto; alguns gráficos podem mostrar vazio até haver sessão.
  return <V5Report />;
}
