require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieSession = require('cookie-session');
const glpiAuthRoutes = require('./routes/glpiAuthRoutes');
const dbRoutes = require('./routes/dbRoutes');
const devBypassAuth = require('./middleware/devBypassAuth');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';
app.use(cookieSession({
  name: 'ptc.sid',
  keys: [SESSION_SECRET],
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000,
  sameSite: 'lax'
}));

// small cookie parser to read simple cookies from incoming requests
function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(/;\s*/).forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq < 0) return;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

// middleware: if client sent a persistent glpi_session_token cookie or glpi_... cookie, populate req.session.glpi
app.use((req, res, next) => {
  const cookies = parseCookies(req);
  let token = cookies['glpi_session_token'] || cookies['glpi-session-token'];
  let tokenName = null;
  if (!token) {
    for (const k of Object.keys(cookies)) {
      if (k.startsWith('glpi_')) { token = cookies[k]; tokenName = k; break; }
    }
  } else {
    tokenName = token ? (cookies['glpi_session_token'] ? 'glpi_session_token' : 'glpi-session-token') : null;
  }

  if (token) {
    try {
      const fs = require('fs');
      const debugLine = JSON.stringify({ ts: new Date().toISOString(), stage: 'middleware', tokenName, tokenPresent: !!token, sessionBefore: req.session || null }) + '\n';
      fs.appendFileSync('/tmp/glpi_cookie_debug.log', debugLine);
    } catch (e) {}
    if (!req.session) req.session = {};
    if (!req.session.glpi) req.session.glpi = {};
    // store cookie-based session info; prefer named session_token when available
    req.session.glpi.session_cookie = token;
    req.session.glpi.cookie_name = tokenName;
    try {
      const fs = require('fs');
      const debugLine2 = JSON.stringify({ ts: new Date().toISOString(), stage: 'middleware-after', sessionAfter: req.session }) + '\n';
      fs.appendFileSync('/tmp/glpi_cookie_debug.log', debugLine2);
    } catch (e) {}
  }
  next();
});

// Mount GLPI auth routes and DB helper routes
// Development bypass middleware (no-op unless DEV_BYPASS_AUTH env var is set)
app.use(devBypassAuth);

app.use('/api/glpi', glpiAuthRoutes);
app.use('/api/db', dbRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Backend minimal para GLPI auth (session_token)', version: '1.0.0' });
});
// (debug route removed)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend GLPI rodando na porta ${PORT}`);
});
