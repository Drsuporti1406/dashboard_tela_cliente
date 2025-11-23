const { loginWithCredentials, killSession } = require('../services/glpiClient');

// POST /api/glpi/login { login, password }
async function login(req, res) {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ success: false, message: 'login and password required' });
    const token = await loginWithCredentials(login, password);
    // store per-user in express-session
    if (req.session) {
      req.session.glpi = { session_token: token };
    }
    // also set a persistent, HttpOnly cookie so the browser will send it on reloads
    try {
      res.cookie('glpi_session_token', token, { maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    } catch (e) {
      // ignore if setting cookie fails
    }
    return res.json({ success: true, session_token: token });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'login failed' });
  }
}

// POST /api/glpi/session { session_token }
async function setSession(req, res) {
  const { session_token } = req.body;
  if (!session_token) return res.status(400).json({ success: false, message: 'session_token required' });
  if (req.session) req.session.glpi = { session_token };
  try {
    res.cookie('glpi_session_token', session_token, { maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  } catch (e) {}
  return res.json({ success: true, session_token });
}

// GET /api/glpi/session
function getSession(req, res) {
  // DEBUG: log incoming cookies and session for troubleshooting auto-login
  try {
    const fs = require('fs');
    const line = JSON.stringify({ ts: new Date().toISOString(), ip: req.ip, cookie: req.headers.cookie || null, session: req.session || null }) + '\n';
    fs.appendFileSync('/tmp/glpi_cookie_debug.log', line);
  } catch (e) {
    // ignore logging errors
  }

  // If the browser sent a GLPI web session cookie like `glpi_<hash>=...`, treat that as a logged-in indicator.
  const cookieHeader = req.headers && req.headers.cookie;
  let cookieToken = null;
  if (cookieHeader) {
    const parts = cookieHeader.split(/;\s*/);
    for (const p of parts) {
      const m = p.match(/^(glpi_[^=]+)=(.+)$/);
      if (m) { cookieToken = m[2]; break; }
    }
  }

  const sess = req.session && req.session.glpi;
  // Accept either an API session_token (from initSession) or a GLPI web session cookie
  const token = (sess && (sess.session_token || sess.session_cookie)) || cookieToken;
  if (!token) return res.json({ success: false, session_token: null });
  return res.json({ success: true, session_token: token });
}

// POST /api/glpi/logout
async function logout(req, res) {
  try {
    const token = req.session && req.session.glpi && req.session.glpi.session_token;
    if (token) {
      await killSession(token);
      delete req.session.glpi;
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'logout failed' });
  }
}

module.exports = { login, setSession, getSession, logout };
