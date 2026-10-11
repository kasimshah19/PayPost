const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const Application = require('../models/Application');
const Withdrawal = require('../models/Withdrawal');
const { APPLICATION_STATUS, LEDGER_TYPE, WITHDRAWAL_STATUS } = require('../constants');
const { calculateBreakdown } = require('./feeCalculator');

function maskUpi(upiId) {
  if (!upiId || typeof upiId !== 'string') return '';
  const parts = upiId.split('@');
  if (parts.length !== 2) return upiId;
  return `${parts[0].slice(0, 2)}***@${parts[1]}`;
}

/**
 * Ensures a wallet exists for the given user (idempotent find-or-create).
 * Handles race conditions via duplicate-key catch.
 * NOTE: When called before an approval transaction, ensureWallet must run outside the transaction.
 */
async function ensureWallet(userId, session = null) {
  if (!userId) {
    throw new Error('userId is required for ensureWallet');
  }

  const query = Wallet.findOne({ user: userId });
  if (session) query.session(session);
  let wallet = await query;

  if (wallet) {
    return wallet;
  }

  try {
    const options = session ? { session } : {};
    const created = await Wallet.create([{ user: userId, balancePaise: 0, heldPaise: 0 }], options);
    return created[0];
  } catch (err) {
    if (err.code === 11000) {
      // Handled duplicate key race: another concurrent call created the wallet
      const retryQuery = Wallet.findOne({ user: userId });
      if (session) retryQuery.session(session);
      return await retryQuery;
    }
    throw err;
  }
}

/**
 * Gets wallet overview for a creator:
 * - balancePaise: Current withdrawable balance
 * - heldPaise: Locked balance (for withdrawals, Phase 7)
 * - lifetimeEarnedPaise: Total payout_credit amounts ever credited
 * - expectedPaise: Net earnings expected from applications currently in 'approved' status (not yet completed/paid)
 * - totalWithdrawnPaise: Sum of succeeded withdrawals
 * - activeWithdrawal: { id, amountPaise, status, requestedAt } or null
 * - lastUpiMasked: Masked UPI ID of latest withdrawal
 * - lastUpiId: Unmasked UPI ID of latest withdrawal (for form prefill)
 */
async function getWalletSummary(userId) {
  const wallet = await ensureWallet(userId);

  // Lifetime earnings aggregated from payout_credit ledger entries
  const lifetimeAgg = await LedgerEntry.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        type: LEDGER_TYPE.PAYOUT_CREDIT
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amountPaise' }
      }
    }
  ]);

  const lifetimeEarnedPaise = lifetimeAgg.length > 0 ? lifetimeAgg[0].total : 0;

  // Expected earnings: applications that are currently "approved" (awaiting submission/review/payout)
  const approvedApps = await Application.find({
    creator: userId,
    status: APPLICATION_STATUS.APPROVED
  }).lean();

  let expectedPaise = 0;
  for (const app of approvedApps) {
    if (app.feePaise && app.feePaise > 0) {
      const breakdown = calculateBreakdown(app.feePaise);
      expectedPaise += breakdown.netPayoutPaise;
    }
  }

  // Total withdrawn paise (sum of succeeded withdrawals)
  const withdrawnAgg = await Withdrawal.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: WITHDRAWAL_STATUS.SUCCEEDED
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amountPaise' }
      }
    }
  ]);
  const totalWithdrawnPaise = withdrawnAgg.length > 0 ? withdrawnAgg[0].total : 0;

  // Active withdrawal (pending or processing)
  const activeDoc = await Withdrawal.findOne({
    user: userId,
    status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.PROCESSING] }
  }).sort({ createdAt: -1 }).lean();

  const activeWithdrawal = activeDoc ? {
    id: activeDoc._id,
    _id: activeDoc._id,
    amountPaise: activeDoc.amountPaise,
    status: activeDoc.status,
    requestedAt: activeDoc.requestedAt
  } : null;

  // Most recent withdrawal for UPI prefilling
  const latestDoc = await Withdrawal.findOne({ user: userId }).sort({ createdAt: -1 }).lean();
  const lastUpiId = latestDoc?.payoutDestination?.upiId || null;
  const lastUpiMasked = lastUpiId ? maskUpi(lastUpiId) : null;

  return {
    balancePaise: wallet.balancePaise,
    heldPaise: wallet.heldPaise,
    lifetimeEarnedPaise,
    expectedPaise,
    totalWithdrawnPaise,
    activeWithdrawal,
    lastUpiMasked,
    lastUpiId
  };
}

/**
 * Gets paginated ledger entries for a creator (newest first).
 */
async function getLedgerEntries(userId, { page = 1, limit = 20, type = null } = {}) {
  await ensureWallet(userId);

  const query = { user: new mongoose.Types.ObjectId(userId) };
  if (type && Object.values(LEDGER_TYPE).includes(type)) {
    query.type = type;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [total, rawEntries] = await Promise.all([
    LedgerEntry.countDocuments(query),
    LedgerEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
  ]);

  // Join withdrawal status for withdrawal_hold and withdrawal_reversal entries
  const withdrawalIds = rawEntries
    .filter(e => e.refType === 'withdrawal' && e.refId)
    .map(e => e.refId);

  let statusMap = new Map();
  if (withdrawalIds.length > 0) {
    const ws = await Withdrawal.find({ _id: { $in: withdrawalIds } }, 'status').lean();
    statusMap = new Map(ws.map(w => [String(w._id), w.status]));
  }

  const entries = rawEntries.map(e => ({
    id: e._id,
    _id: e._id,
    type: e.type,
    direction: e.direction,
    amountPaise: e.amountPaise,
    balanceAfterPaise: e.balanceAfterPaise,
    description: e.description,
    createdAt: e.createdAt,
    refType: e.refType,
    refId: e.refId,
    meta: e.meta,
    breakdown: e.meta?.breakdown || null,
    campaignTitle: e.meta?.campaignTitle || '',
    withdrawalStatus: e.refType === 'withdrawal' && e.refId ? (statusMap.get(String(e.refId)) || null) : null
  }));

  return {
    entries,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

module.exports = {
  ensureWallet,
  getWalletSummary,
  getLedgerEntries,
  maskUpi
};
