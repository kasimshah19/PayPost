const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const Application = require('../models/Application');
const { APPLICATION_STATUS, LEDGER_TYPE } = require('../constants');
const { calculateBreakdown } = require('./feeCalculator');

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

  return {
    balancePaise: wallet.balancePaise,
    heldPaise: wallet.heldPaise,
    lifetimeEarnedPaise,
    expectedPaise
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
    campaignTitle: e.meta?.campaignTitle || ''
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
  getLedgerEntries
};
