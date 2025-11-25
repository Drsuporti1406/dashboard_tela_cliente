module.exports = function apiKeyMiddleware(req, res, next) {
  const key = process.env.DEV_API_KEY;
  // if not configured, do not enforce auth
  if (!key) return next();
  const provided = (req.headers['x-api-key'] || req.query.apiKey || '').trim();
  if (provided === key) return next();
  res.setHeader('WWW-Authenticate', 'ApiKey realm="Dev"');
  return res.status(401).json({ success: false, message: 'invalid api key' });
};
