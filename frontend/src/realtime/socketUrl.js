/**
 * Calculates the Socket.IO server URL based on provided environment variables.
 *
 * Rules:
 * 1. If VITE_SOCKET_URL is set (non-empty), use it (trim trailing slashes).
 * 2. Else if VITE_API_URL is set, derive from it: remove trailing "/api" and trailing slashes.
 * 3. Else, in development only (!env.PROD), use 'http://localhost:5000'.
 * 4. Else (production and nothing is set): return null.
 *
 * @param {Object} env - Environment object (e.g. import.meta.env or { VITE_SOCKET_URL, VITE_API_URL, PROD })
 * @returns {string|null} The resolved socket URL, or null if unconfigured in production.
 */
export function getSocketUrl(env = {}) {
  const socketUrl = typeof env.VITE_SOCKET_URL === 'string' ? env.VITE_SOCKET_URL.trim() : '';
  if (socketUrl) {
    return socketUrl.replace(/\/+$/, '');
  }

  const apiUrl = typeof env.VITE_API_URL === 'string' ? env.VITE_API_URL.trim() : '';
  if (apiUrl) {
    return apiUrl.replace(/\/+$/, '').replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }

  // Development fallback only
  if (!env.PROD) {
    return 'http://localhost:5000';
  }

  // Production with nothing set: return null (never fall back to localhost in production)
  return null;
}
