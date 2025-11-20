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
  return res.json({ success: true, session_token });
}

// GET /api/glpi/session
function getSession(req, res) {
  const token = req.session && req.session.glpi && req.session.glpi.session_token;
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
