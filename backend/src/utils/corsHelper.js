/**
 * Shared CORS Origins Resolver
 * Parses comma-separated CLIENT_URL or array of allowed origins.
 */
function parseAllowedOrigins(clientUrlOrArray) {
  if (!clientUrlOrArray) return ['http://localhost:5173'];
  const rawList = Array.isArray(clientUrlOrArray)
    ? clientUrlOrArray
    : String(clientUrlOrArray).split(',');
  return rawList
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true; // server-to-server or mobile app
  const sanitizedOrigin = origin.trim().replace(/\/+$/, '');
  const list = parseAllowedOrigins(allowedOrigins);
  return list.includes(sanitizedOrigin);
}

module.exports = {
  parseAllowedOrigins,
  isOriginAllowed
};
