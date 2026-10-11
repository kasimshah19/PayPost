/**
 * Mock WhatsApp Provider for testing and local development.
 *
 * NOTE: This file is one of the only two files to replace with a real WhatsApp provider
 * (such as Twilio or Gupshup / Meta WhatsApp Cloud API) in production.
 */

const crypto = require('crypto');
const env = require('../config/env');

// In-memory cache of already-sent idempotency keys
const sentMap = new Map();

/**
 * Sends a mock WhatsApp message.
 * Deterministic outcome derived from idempotencyKey hash.
 */
async function send({ idempotencyKey, to, body }) {
  if (sentMap.has(idempotencyKey)) {
    return sentMap.get(idempotencyKey);
  }

  const delayMs = env.MOCK_NOTIFY_DELAY_MS !== undefined ? Number(env.MOCK_NOTIFY_DELAY_MS) : 200;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const hash = crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex');
  const providerRef = `mockwa_${hash.substring(0, 16)}`;

  // Partially mask phone number for clean logging: +91XXXXXX1234
  let maskedTo = to || 'unknown';
  if (maskedTo.length >= 8) {
    const start = maskedTo.slice(0, 3);
    const end = maskedTo.slice(-4);
    maskedTo = `${start}XXXXXX${end}`;
  }
  console.log(`[MOCK WHATSAPP] to=${maskedTo} providerRef=${providerRef}`);

  let status = 'success';
  let failureReason;

  const mode = env.MOCK_NOTIFY_MODE || 'random';
  if (mode === 'always_fail') {
    status = 'failed';
    failureReason = 'WhatsApp messaging failure (mock)';
  } else if (mode === 'always_success') {
    status = 'success';
  } else {
    // Mode is 'random': derive pseudo-random float 0..1 from hash integer
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const score = hashInt / 0xffffffff;
    const rate = env.MOCK_NOTIFY_SUCCESS_RATE !== undefined ? Number(env.MOCK_NOTIFY_SUCCESS_RATE) : 0.9;
    if (score > rate) {
      status = 'failed';
      failureReason = 'Delivery rejected by recipient handset (mock)';
    } else {
      status = 'success';
    }
  }

  const result = { providerRef, status, failureReason };
  sentMap.set(idempotencyKey, result);
  return result;
}

function _clearCache() {
  sentMap.clear();
}

module.exports = {
  send,
  _clearCache,
  _resetCache: _clearCache
};
