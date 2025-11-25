import React, { useState } from 'react';

export default function DevLogin() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  const save = () => {
    try {
      localStorage.setItem('DEV_API_KEY', key.trim());
      // also update axios default if available
      try { window.axios && (window.axios.defaults.headers.common['x-api-key'] = key.trim()); } catch (e) {}
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Falha ao salvar a chave: ' + e.message);
    }
  };

  const clear = () => {
    try {
      localStorage.removeItem('DEV_API_KEY');
      try { window.axios && delete window.axios.defaults.headers.common['x-api-key']; } catch (e) {}
      setKey('');
      setSaved(false);
    } catch (e) {}
  };

  return (
    <div style={{ padding: 12, maxWidth: 480 }}>
      <h3>Login de desenvolvimento</h3>
      <p>Coloque a chave de API de desenvolvimento (env `DEV_API_KEY`).</p>
      <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Chave API" style={{ width: '100%', padding: '8px' }} />
      <div style={{ marginTop: 8 }}>
        <button onClick={save} style={{ marginRight: 8 }}>Salvar</button>
        <button onClick={clear}>Limpar</button>
        {saved ? <span style={{ marginLeft: 8, color: 'green' }}>Salvo</span> : null}
      </div>
      <p style={{ marginTop: 12 }}><strong>Uso:</strong> depois de salvar, recarregue a página para que o header seja aplicado em todas as requisições.</p>
    </div>
  );
}
