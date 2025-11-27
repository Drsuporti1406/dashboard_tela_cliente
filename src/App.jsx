import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App2.css';
import V5Report from './pages/V5Report';
import Inventory from './pages/Inventory';

export default function App() {
  // authChecked: concluímos verificação do token principal (SSO) vindo do helpcentral_front
  const [authChecked, setAuthChecked] = useState(false);
  const [glpiReady, setGlpiReady] = useState(false); // opcional: GLPI session estabelecida
  const [currentPage, setCurrentPage] = useState('v5report');

  // Navegação simples por hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // remove o #
      if (hash === '/inventory') {
        setCurrentPage('inventory');
      } else {
        setCurrentPage('v5report');
      }
    };

    handleHashChange(); // inicializa
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Verifica se existe token de autenticação gerado pelo helpcentral_front
  useEffect(() => {
    // Em ambiente de desenvolvimento não redirecionamos para a tela de login
    // Isso permite que o dashboard carregue e execute os efeitos de busca de dados.
    if (import.meta.env && import.meta.env.DEV) {
      setAuthChecked(true);
      return;
    }

    // Comportamento padrão: verificar token compartilhado e redirecionar se ausente
    const token = (() => {
      try { return localStorage.getItem('token'); } catch (e) { return null; }
    })();
    if (!token) {
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
        const BACKEND = (_VITE_BACKEND || '').replace(/\/$/, '');

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

  // Navegação entre páginas
  const renderPage = () => {
    switch (currentPage) {
      case 'inventory':
        return <Inventory />;
      case 'v5report':
      default:
        return <V5Report />;
    }
  };

  return renderPage();
}
