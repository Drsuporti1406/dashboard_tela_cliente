import React, { useState } from 'react';
import axios from 'axios';
import '../App2.css';

export default function GlpiLogin({ onSuccess }) {
  const [mode, setMode] = useState('credentials'); // 'credentials' | 'token'
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const _VITE_BACKEND = import.meta.env.VITE_BACKEND_URL || '';
  const BACKEND = (_VITE_BACKEND || '').replace(/\/$/, '');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await axios.post(`${BACKEND}/api/glpi/login`, { login, password }, { withCredentials: true });
      if (resp.data && resp.data.success) {
        // store session_token so reloads can auto-detect
        if (resp.data.session_token) {
          try { localStorage.setItem('glpi_session_token', resp.data.session_token); } catch (e) {}
        }
        onSuccess?.();
      } else {
        setError(resp.data?.message || 'Falha no login.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao conectar ao backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetToken = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await axios.post(`${BACKEND}/api/glpi/session`, { session_token: token }, { withCredentials: true });
      if (resp.data && resp.data.success) {
        // persist the provided token so reloads can auto-detect
        try { localStorage.setItem('glpi_session_token', token); } catch (e) {}
        onSuccess?.();
      } else {
        setError(resp.data?.message || 'Token inválido.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Erro ao conectar ao backend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <h2>Conectar ao Dashboard</h2>
        <div className="login-tabs">
          <button className={mode === 'credentials' ? 'active' : ''} onClick={() => setMode('credentials')}>Login e senha</button>
          <button className={mode === 'token' ? 'active' : ''} onClick={() => setMode('token')}>Usar session token</button>
        </div>

        {mode === 'credentials' ? (
          <form onSubmit={handleLogin} className="login-form">
            <label>
              Usuário
              <input type="text" value={login} onChange={e => setLogin(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? 'Conectando...' : 'Entrar'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetToken} className="login-form">
            <label>
              Session Token
              <input type="text" value={token} onChange={e => setToken(e.target.value)} required />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn-blue" disabled={loading}>
              {loading ? 'Validando...' : 'Usar token'}
            </button>
          </form>
        )}

        <p className="login-help">Você pode usar credenciais (login/senha) ou colar um `session_token` já válido.</p>
      </div>
    </div>
  );
}
