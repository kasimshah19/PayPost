/**
 * Shared CORS Origins Resolver
 * Parses comma-separated CLIENT_URL or array of allowed origins.
 */
function parseAllowedOrigins(clientUrlOrArray) {
  if (!clientUrlOrArray) return ['http://localhost:5173'];
  if (Array.isArray(clientUrlOrArray)) return clientUrlOrArray.map(s => s.trim()).filter(Boolean);
  return String(clientUrlOrArray).split(',').map(s => s.trim()).filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true; // server-to-server or mobile app
  const list = parseAllowedOrigins(allowedOrigins);
  return list.includes(origin);
}

module.exports = {
  parseAllowedOrigins,
  isOriginAllowed
};
