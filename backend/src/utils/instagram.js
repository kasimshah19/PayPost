/**
 * Instagram URL validation and normalization helper.
 * Note: We cannot check that the post really exists (Instagram is mocked).
 * This utility validates URL structure, protocol, domain, and extracts the post identifier code.
 */

function validateInstagramUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'Instagram URL is required' };
  }

  const trimmed = urlString.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return { isValid: false, error: 'Must be a valid URL' };
  }

  // Must be HTTPS protocol
  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Must be a valid HTTPS URL' };
  }

  // Host must be instagram.com or www.instagram.com
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    return { isValid: false, error: 'URL must belong to instagram.com' };
  }

  // Path matching: /p/<code>, /reel/<code>, /reels/<code> or /tv/<code> (optionally prefixed by /<username>/)
  // <code> matches [A-Za-z0-9_-]+
  const pathRegex = /^(?:\/([a-zA-Z0-9_.]+))?\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/)?$/;
  const match = parsed.pathname.match(pathRegex);

  if (!match) {
    return { isValid: false, error: 'URL must be a valid Instagram post, reel, or TV link' };
  }

  const username = match[1];
  const type = match[2];
  const code = match[3];

  // Normalize: strip query string, hash, and trailing slash
  const cleanPathname = parsed.pathname.replace(/\/+$/, '');
  const postUrl = `https://${hostname}${cleanPathname}`;

  return {
    isValid: true,
    postUrl,
    postUrlKey: code,
    code,
    type,
    username: username || null
  };
}

module.exports = {
  validateInstagramUrl
};
