# Projeto Tela Cliente (V5 Dashboard)

Este é um scaffold mínimo do dashboard V5 convertido para React + Vite.

Como rodar:

1. Abrir PowerShell
2. Instalar dependências

```powershell
cd C:\github\projeto_tela_cliente
npm install
npm run dev
```

3. Abrir o navegador em `http://localhost:5173` (ou na porta indicada pelo Vite) e a página principal mostra a dashboard.

Observações:
- O projeto inclui `chart.js` e `axios`.
- O componente `V5Report` usa `GET /api/entities` para popular o dropdown de clientes; se não houver backend rodando, o dashboard usa dados mock inclusos.
