// Development helper middleware: when DEV_BYPASS_AUTH is enabled, automatically
// establish a GLPI session on incoming requests so the frontend can access
// protected endpoints without performing the normal SSO/login flow.
//
// This middleware is intentionally safe for production: when the env var is not
// set it is a no-op. To enable during local testing set:
//   DEV_BYPASS_AUTH=1
// Optionally set a specific token with:
//   DEV_FAKE_SESSION="my-test-token"
// If DEV_BYPASS_COOKIE=1 the middleware will also attempt to set a non-HttpOnly
// cookie named `glpi_session_token` (useful for testing in some browsers).

module.exports = function devBypassAuth(req, res, next) {
  try {
    const enabled = String(process.env.DEV_BYPASS_AUTH || '').toLowerCase() === '1' || String(process.env.DEV_BYPASS_AUTH || '').toLowerCase() === 'true';
    if (!enabled) return next();

    if (!req.session) req.session = {};
    if (!req.session.glpi) {
      const token = process.env.DEV_FAKE_SESSION || 'dev-bypass-session';
      req.session.glpi = { session_token: token };
    }

    // Optionally emit a cookie for browser debug (not HttpOnly by design when enabled)
    try {
      if (String(process.env.DEV_BYPASS_COOKIE || '').toLowerCase() === '1') {
        res.cookie('glpi_session_token', req.session.glpi.session_token, { maxAge: 7 * 24 * 60 * 60 * 1000, path: '/', sameSite: 'lax' });
      }
    } catch (e) {
      // ignore cookie errors
    }

    return next();
  } catch (err) {
    return next();
  }
};
