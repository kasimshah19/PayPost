/**
 * Shared Instagram validation and normalization logic for Frontend.
 * We cannot check that the post really exists (Instagram is mocked).
 */
export function validateInstagramUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    return { isValid: false, error: 'Instagram post URL is required' };
  }

  const trimmed = urlString.trim();

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return { isValid: false, error: 'Must be a valid URL (e.g. https://www.instagram.com/p/...)' };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'Must be a valid HTTPS URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'instagram.com' && hostname !== 'www.instagram.com') {
    return { isValid: false, error: 'URL must belong to instagram.com' };
  }

  // /p/<code>, /reel/<code>, /reels/<code> or /tv/<code> (optionally prefixed by /<username>/)
  const pathRegex = /^(?:\/([a-zA-Z0-9_.]+))?\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)(?:\/)?$/;
  const match = parsed.pathname.match(pathRegex);

  if (!match) {
    return { isValid: false, error: 'URL must be a valid Instagram post, reel, or TV link' };
  }

  const username = match[1];
  const type = match[2];
  const code = match[3];

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
