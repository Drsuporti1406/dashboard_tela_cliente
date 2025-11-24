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
- Sistema de login próprio removido: agora o dashboard depende do login feito em `helpcentral_front`.
	- O token de autenticação (`localStorage['token']`) precisa estar presente (mesma origem/domínio) ou o usuário será redirecionado para `/sign-in`.
	- A sessão GLPI é detectada automaticamente via `GET /api/glpi/session` ou reaproveita `glpi_session_token` armazenado em `localStorage` / cookie; se ausente, alguns dados podem falhar até a sessão ser criada externamente.
	- Para domínios diferentes, considere unificar em um subdomínio comum (ex.: `app.example.com/helpcentral` e `app.example.com/dashboard`) ou implementar um fluxo `postMessage` que sincronize o token antes do carregamento.
