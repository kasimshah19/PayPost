/**
 * ============================================================================
 * MOCK PAYOUT PROVIDER
 * NOTE: this file is the only thing to replace with a real provider (e.g. RazorpayX, Cashfree).
 * ============================================================================
 * 
 * Simulates external bank / UPI payout processing.
 * - Deterministic results based on UPI ID or providerRef hash
 * - Survives server restarts
 * - In-memory cache for fast idempotent repeat calls
 */

const crypto = require('crypto');
const env = require('../config/env');

// In-memory maps for idempotency and quick lookup
const cacheByKey = new Map();
const cacheByRef = new Map();

/**
 * Derives outcome deterministically for a given idempotencyKey and upiId.
 */
function computeOutcome(idempotencyKey, upiId) {
  const hash = crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex');
  const providerRef = 'mockpay_' + hash.slice(0, 16);

  const lowerUpi = String(upiId || '').toLowerCase();

  // 1. Explicit mock test handles
  if (lowerUpi.startsWith('success@')) {
    return { providerRef, status: 'success' };
  }

  if (lowerUpi.startsWith('fail@')) {
    return {
      providerRef,
      status: 'failed',
      failureReason: 'Bank rejected the transfer (mock)'
    };
  }

  // 2. Controlled via environment mode
  const mode = env.MOCK_PAYOUT_MODE || 'random';

  if (mode === 'always_success') {
    return { providerRef, status: 'success' };
  }

  if (mode === 'always_fail') {
    return {
      providerRef,
      status: 'failed',
      failureReason: 'Bank rejected the transfer (mock)'
    };
  }

  // 3. 'random' mode: deterministic pseudo-random float [0, 1) derived from providerRef hash
  const refHash = crypto.createHash('sha256').update(providerRef).digest('hex');
  const score = parseInt(refHash.slice(0, 8), 16) / 0xffffffff;
  const successRate = env.MOCK_PAYOUT_SUCCESS_RATE !== undefined ? env.MOCK_PAYOUT_SUCCESS_RATE : 0.7;

  if (score < successRate) {
    return { providerRef, status: 'success' };
  } else {
    return {
      providerRef,
      status: 'failed',
      failureReason: 'Bank rejected the transfer (mock)'
    };
  }
}

/**
 * Initiates a mock payout transfer.
 * Delays for MOCK_PAYOUT_DELAY_MS (0 in test environments), then returns outcome.
 */
async function initiatePayout({ idempotencyKey, amountPaise, upiId }) {
  if (cacheByKey.has(idempotencyKey)) {
    return cacheByKey.get(idempotencyKey);
  }

  const result = computeOutcome(idempotencyKey, upiId);

  // Simulate network / provider delay
  const delayMs = env.MOCK_PAYOUT_DELAY_MS || 0;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  cacheByKey.set(idempotencyKey, result);
  cacheByRef.set(result.providerRef, result);

  return result;
}

/**
 * Returns payout status by providerRef.
 * Survives server restarts by falling back to DB lookup or deterministic hash computation.
 */
async function getPayoutStatus(providerRef) {
  if (cacheByRef.has(providerRef)) {
    return cacheByRef.get(providerRef);
  }

  // Lazy-load Withdrawal model to lookup stored upiId & idempotencyKey if restarted
  try {
    const Withdrawal = require('../models/Withdrawal');
    const withdrawal = await Withdrawal.findOne({ providerRef });
    if (withdrawal) {
      const result = computeOutcome(withdrawal.idempotencyKey, withdrawal.payoutDestination?.upiId);
      cacheByKey.set(withdrawal.idempotencyKey, result);
      cacheByRef.set(providerRef, result);
      return result;
    }
  } catch (err) {
    // If DB is unreachable or model error, fallback to ref-hash
  }

  // Fallback: derive status directly from providerRef hash
  const refHash = crypto.createHash('sha256').update(providerRef).digest('hex');
  const score = parseInt(refHash.slice(0, 8), 16) / 0xffffffff;
  const successRate = env.MOCK_PAYOUT_SUCCESS_RATE !== undefined ? env.MOCK_PAYOUT_SUCCESS_RATE : 0.7;
  const isSuccess = score < successRate;

  const result = {
    providerRef,
    status: isSuccess ? 'success' : 'failed',
    failureReason: isSuccess ? undefined : 'Bank rejected the transfer (mock)'
  };

  cacheByRef.set(providerRef, result);
  return result;
}

/**
 * Helper to reset in-memory cache during tests.
 */
function _resetCache() {
  cacheByKey.clear();
  cacheByRef.clear();
}

module.exports = {
  initiatePayout,
  getPayoutStatus,
  _resetCache
};
