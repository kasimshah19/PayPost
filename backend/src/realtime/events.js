/**
 * Event Constants and Payload Allowlist for Socket.IO
 * R5. PAYLOAD ALLOWLIST:
 * Only keys: type, at, campaignId, campaignTitle, applicationId, submissionId,
 * withdrawalId, status, reason, amountPaise, showToast.
 * All other properties are strictly discarded to prevent data leaks.
 */

const EVENTS = {
  APPLICATION_CHANGED: 'application:changed',
  SUBMISSION_CHANGED: 'submission:changed',
  CAMPAIGN_CHANGED: 'campaign:changed',
  DISCOVER_CHANGED: 'discover:changed',
  WALLET_CHANGED: 'wallet:changed',
  WITHDRAWAL_CHANGED: 'withdrawal:changed',
  NOTIFICATION_CHANGED: 'notification:changed'
};

const ALLOWED_KEYS = new Set([
  'type',
  'at',
  'campaignId',
  'campaignTitle',
  'applicationId',
  'submissionId',
  'withdrawalId',
  'status',
  'reason',
  'amountPaise',
  'showToast'
]);

function buildPayload(type, rawData = {}) {
  const payload = {
    type,
    at: rawData.at || new Date().toISOString()
  };

  for (const [key, value] of Object.entries(rawData)) {
    if (ALLOWED_KEYS.has(key) && value !== undefined) {
      if (key === 'campaignId' || key === 'applicationId' || key === 'submissionId' || key === 'withdrawalId') {
        payload[key] = String(value);
      } else {
        payload[key] = value;
      }
    }
  }

  // Ensure boolean for showToast
  if (rawData.showToast !== undefined) {
    payload.showToast = Boolean(rawData.showToast);
  }

  return payload;
}

module.exports = {
  EVENTS,
  ALLOWED_KEYS,
  buildPayload
};
