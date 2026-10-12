const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const { WITHDRAWAL_STATUS, LEDGER_TYPE, LEDGER_DIRECTION, MIN_WITHDRAWAL_PAISE, NOTIFICATION_EVENTS } = require('../constants');
const { ensureWallet } = require('./walletService');
const withTransaction = require('../utils/withTransaction');
const notificationService = require('./notificationService');
const { emitToUser, afterCommit, EVENTS } = require('../realtime');

/**
 * Masks a UPI ID: first 2 characters + '***' + the part after @
 * e.g. "ab***@okbank"
 */
function maskUpi(upiId) {
  if (!upiId || typeof upiId !== 'string') return '';
  const parts = upiId.split('@');
  if (parts.length !== 2) return upiId;
  const prefix = parts[0];
  const handle = parts[1];
  const visible = prefix.slice(0, 2);
  return `${visible}***@${handle}`;
}

/**
 * Sanitizes withdrawal object for API responses (masked UPI ID).
 */
function formatWithdrawal(w) {
  if (!w) return null;
  const doc = w.toObject ? w.toObject() : w;
  return {
    id: doc._id,
    _id: doc._id,
    amountPaise: doc.amountPaise,
    status: doc.status,
    isActive: Boolean(doc.isActive),
    payoutDestination: {
      type: doc.payoutDestination?.type || 'upi',
      upiId: maskUpi(doc.payoutDestination?.upiId)
    },
    failureReason: doc.failureReason || null,
    requestedAt: doc.requestedAt,
    createdAt: doc.createdAt || doc.requestedAt,
    updatedAt: doc.updatedAt,
    processedAt: doc.processedAt || null,
    providerRef: doc.providerRef || null,
    attempts: doc.attempts || 0,
    statusHistory: doc.statusHistory || []
  };
}

/**
 * Creates a new withdrawal request for a creator.
 * - Idempotency via <userId>:<clientKey>
 * - Only 1 active withdrawal allowed
 * - Atomic balance -> held transfer in a single transaction
 * - LedgerEntry: withdrawal_hold
 */
async function requestWithdrawal({ userId, amountPaise, upiId, clientKey }) {
  if (!userId) {
    const err = new Error('User ID is required');
    err.statusCode = 400;
    throw err;
  }

  // Business validation
  if (!Number.isInteger(amountPaise) || amountPaise < MIN_WITHDRAWAL_PAISE) {
    const err = new Error(`Amount must be an integer of at least ${MIN_WITHDRAWAL_PAISE} paise (₹${MIN_WITHDRAWAL_PAISE / 100})`);
    err.statusCode = 400;
    throw err;
  }

  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  if (!upiId || !upiRegex.test(upiId)) {
    const err = new Error('Invalid UPI ID format');
    err.statusCode = 400;
    throw err;
  }

  const idempotencyKey = `${userId}:${clientKey}`;

  // 1. Before transaction: check existing withdrawal by idempotencyKey
  const existing = await Withdrawal.findOne({ idempotencyKey });
  if (existing) {
    const currentWallet = await ensureWallet(userId);
    return {
      withdrawal: formatWithdrawal(existing),
      wallet: currentWallet,
      isReplay: true
    };
  }

  // 2. Check for currently active withdrawal (pending or processing)
  const activeExisting = await Withdrawal.findOne({ user: userId, isActive: true });
  if (activeExisting) {
    const conflictErr = new Error('You already have a withdrawal in progress');
    conflictErr.statusCode = 409;
    throw conflictErr;
  }

  // 3. ensureWallet MUST run before the transaction
  const wallet = await ensureWallet(userId);

  // 4. Run atomic creation in one transaction
  try {
    const result = await withTransaction(async (session) => {
      // (1) Create Withdrawal document
      const [withdrawal] = await Withdrawal.create([{
        user: userId,
        wallet: wallet._id,
        amountPaise,
        status: WITHDRAWAL_STATUS.PENDING,
        isActive: true,
        payoutDestination: { type: 'upi', upiId },
        requestedAt: new Date(),
        idempotencyKey,
        attempts: 0,
        statusHistory: [{
          from: null,
          to: WITHDRAWAL_STATUS.PENDING,
          at: new Date(),
          note: 'Withdrawal requested'
        }]
      }], { session });

      // (2) Atomic wallet update: balancePaise >= amount
      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: userId, balancePaise: { $gte: amountPaise } },
        { $inc: { balancePaise: -amountPaise, heldPaise: +amountPaise } },
        { new: true, session }
      );

      if (!updatedWallet) {
        const err = new Error('Insufficient balance');
        err.statusCode = 409;
        throw err;
      }

      // (3) Create LedgerEntry: type "withdrawal_hold", direction "debit"
      await LedgerEntry.create([{
        wallet: updatedWallet._id,
        user: userId,
        type: LEDGER_TYPE.WITHDRAWAL_HOLD,
        direction: LEDGER_DIRECTION.DEBIT,
        amountPaise,
        balanceAfterPaise: updatedWallet.balancePaise,
        refType: 'withdrawal',
        refId: withdrawal._id,
        description: 'Withdrawal requested',
        meta: {
          withdrawalId: withdrawal._id,
          upiMasked: maskUpi(upiId)
        },
        idempotencyKey: `withdrawal-hold:${withdrawal._id}`
      }], { session });

      // Notify creator withdrawal requested
      await notificationService.notify({
        recipientId: userId,
        event: NOTIFICATION_EVENTS.WITHDRAWAL_REQUESTED,
        dedupeRefId: withdrawal._id.toString(),
        payload: {
          amountPaise,
          maskedUpi: maskUpi(upiId)
        },
        session
      });

      afterCommit(session, () => {
        emitToUser(userId, EVENTS.WALLET_CHANGED, {
          reason: 'withdrawal_hold',
          showToast: false
        });

        emitToUser(userId, EVENTS.WITHDRAWAL_CHANGED, {
          withdrawalId: withdrawal._id,
          status: 'pending',
          showToast: false
        });
      });

      return {
        withdrawal: formatWithdrawal(withdrawal),
        wallet: updatedWallet,
        isReplay: false
      };
    });

    return result;
  } catch (err) {
    // Handle race condition duplicate key errors
    if (err.code === 11000) {
      if (err.keyPattern?.idempotencyKey || (err.message && err.message.includes('idempotencyKey'))) {
        const raceExisting = await Withdrawal.findOne({ idempotencyKey });
        if (raceExisting) {
          const curWallet = await ensureWallet(userId);
          return {
            withdrawal: formatWithdrawal(raceExisting),
            wallet: curWallet,
            isReplay: true
          };
        }
      }
      if (err.keyPattern?.user || (err.message && err.message.includes('isActive'))) {
        const conflictErr = new Error('You already have a withdrawal in progress');
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
    }
    throw err;
  }
}

/**
 * Finalizes a claimed withdrawal.
 * Safe to call twice or from two places concurrently.
 * SUCCESS:
 * - Status -> succeeded, heldPaise -amount
 * - $unset isActive
 * FAILURE:
 * - Status -> failed, heldPaise -amount, balancePaise +amount
 * - $unset isActive
 * - LedgerEntry: withdrawal_reversal (credit)
 */
async function finalizeWithdrawal(withdrawalId, result) {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal || withdrawal.status !== WITHDRAWAL_STATUS.PROCESSING) {
    return null;
  }

  if (result.status === 'success') {
    return await withTransaction(async (session) => {
      // Conditional update: only succeeds if still processing
      const updated = await Withdrawal.findOneAndUpdate(
        { _id: withdrawalId, status: WITHDRAWAL_STATUS.PROCESSING },
        {
          status: WITHDRAWAL_STATUS.SUCCEEDED,
          providerRef: result.providerRef,
          processedAt: new Date(),
          $unset: { isActive: 1 },
          $push: {
            statusHistory: {
              from: WITHDRAWAL_STATUS.PROCESSING,
              to: WITHDRAWAL_STATUS.SUCCEEDED,
              at: new Date(),
              note: 'Payout completed successfully'
            }
          }
        },
        { session, new: true }
      );

      if (!updated) return null; // Already finalized concurrently

      // Atomic wallet update: heldPaise -amount
      await Wallet.findOneAndUpdate(
        { user: updated.user, heldPaise: { $gte: updated.amountPaise } },
        { $inc: { heldPaise: -updated.amountPaise } },
        { session }
      );

      // Notify creator withdrawal succeeded
      await notificationService.notify({
        recipientId: updated.user,
        event: NOTIFICATION_EVENTS.WITHDRAWAL_SUCCEEDED,
        dedupeRefId: updated._id.toString(),
        payload: {
          amountPaise: updated.amountPaise,
          maskedUpi: maskUpi(updated.payoutDestination?.accountNumber || updated.payoutDestination?.upiId)
        },
        session
      });

      afterCommit(session, () => {
        emitToUser(updated.user, EVENTS.WALLET_CHANGED, {
          reason: 'withdrawal_succeeded',
          amountPaise: updated.amountPaise,
          showToast: true
        });

        emitToUser(updated.user, EVENTS.WITHDRAWAL_CHANGED, {
          withdrawalId: updated._id,
          status: 'succeeded',
          showToast: true
        });
      });

      return updated;
    });
  } else {
    // Failure flow
    return await withTransaction(async (session) => {
      const updated = await Withdrawal.findOneAndUpdate(
        { _id: withdrawalId, status: WITHDRAWAL_STATUS.PROCESSING },
        {
          status: WITHDRAWAL_STATUS.FAILED,
          failureReason: result.failureReason || 'Payout failed',
          processedAt: new Date(),
          $unset: { isActive: 1 },
          $push: {
            statusHistory: {
              from: WITHDRAWAL_STATUS.PROCESSING,
              to: WITHDRAWAL_STATUS.FAILED,
              at: new Date(),
              note: result.failureReason || 'Payout failed'
            }
          }
        },
        { session, new: true }
      );

      if (!updated) return null; // Already finalized

      // Refund held balance back to available balance
      const updatedWallet = await Wallet.findOneAndUpdate(
        { user: updated.user, heldPaise: { $gte: updated.amountPaise } },
        { $inc: { heldPaise: -updated.amountPaise, balancePaise: +updated.amountPaise } },
        { session, new: true }
      );

      // Record reversal credit in ledger
      await LedgerEntry.create([{
        wallet: updatedWallet._id,
        user: updated.user,
        type: LEDGER_TYPE.WITHDRAWAL_REVERSAL,
        direction: LEDGER_DIRECTION.CREDIT,
        amountPaise: updated.amountPaise,
        balanceAfterPaise: updatedWallet.balancePaise,
        refType: 'withdrawal',
        refId: updated._id,
        description: 'Withdrawal failed, amount returned',
        meta: {
          withdrawalId: updated._id,
          reason: result.failureReason || 'Payout failed'
        },
        idempotencyKey: `withdrawal-reversal:${updated._id}`
      }], { session });

      // Notify creator withdrawal failed
      await notificationService.notify({
        recipientId: updated.user,
        event: NOTIFICATION_EVENTS.WITHDRAWAL_FAILED,
        dedupeRefId: updated._id.toString(),
        payload: {
          amountPaise: updated.amountPaise,
          maskedUpi: maskUpi(updated.payoutDestination?.accountNumber || updated.payoutDestination?.upiId),
          reason: result.failureReason || 'Payout failed'
        },
        session
      });

      afterCommit(session, () => {
        emitToUser(updated.user, EVENTS.WALLET_CHANGED, {
          reason: 'withdrawal_reversed',
          amountPaise: updated.amountPaise,
          showToast: true
        });

        emitToUser(updated.user, EVENTS.WITHDRAWAL_CHANGED, {
          withdrawalId: updated._id,
          status: 'failed',
          showToast: true
        });
      });

      return updated;
    });
  }
}

/**
 * Gets paginated withdrawals for a creator (newest first).
 */
async function getWithdrawals(userId, { status, page = 1, limit = 20 } = {}) {
  const query = { user: new mongoose.Types.ObjectId(userId) };
  if (status && Object.values(WITHDRAWAL_STATUS).includes(status)) {
    query.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [total, rawDocs] = await Promise.all([
    Withdrawal.countDocuments(query),
    Withdrawal.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum)
  ]);

  const withdrawals = rawDocs.map(formatWithdrawal);

  return {
    withdrawals,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

/**
 * Gets withdrawal details with full status history.
 * Returns null if not found or belongs to another user.
 */
async function getWithdrawalById(userId, withdrawalId) {
  if (!mongoose.Types.ObjectId.isValid(withdrawalId)) {
    return null;
  }

  const doc = await Withdrawal.findOne({
    _id: withdrawalId,
    user: userId
  });

  return formatWithdrawal(doc);
}

module.exports = {
  maskUpi,
  formatWithdrawal,
  requestWithdrawal,
  finalizeWithdrawal,
  getWithdrawals,
  getWithdrawalById
};
