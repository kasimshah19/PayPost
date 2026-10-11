const User = require('../models/User');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const Submission = require('../models/Submission');
const Application = require('../models/Application');
const Campaign = require('../models/Campaign');
const { ROLES, SUBMISSION_STATUS, LEDGER_TYPE, LEDGER_DIRECTION } = require('../constants');
const { calculateBreakdown } = require('./feeCalculator');
const { ensureWallet } = require('./walletService');
const withTransaction = require('../utils/withTransaction');

/**
 * Backfills wallets and historical Phase 5 approved submissions:
 * 1. Ensures every user with role 'creator' has a Wallet document.
 * 2. For every approved Submission with missing payoutBreakdown:
 *    - Calculates the fee breakdown.
 *    - Inside an atomic transaction per submission:
 *      * Saves payoutBreakdown onto the submission.
 *      * Atomically credits the creator's wallet with netPayoutPaise.
 *      * Writes a LedgerEntry with idempotencyKey "payout:<submissionId>".
 *      * Leaves campaign counters untouched (they were already shifted in Phase 5).
 *    - If already processed (idempotencyKey exists), transaction aborts without side-effects.
 */
async function backfillWallets() {
  const summary = {
    walletsCreated: 0,
    submissionsProcessed: 0,
    submissionsSkipped: 0
  };

  // 1. Ensure all creators have wallets
  const creators = await User.find({ role: ROLES.CREATOR }).lean();
  for (const creator of creators) {
    const existing = await Wallet.findOne({ user: creator._id });
    if (!existing) {
      await ensureWallet(creator._id);
      summary.walletsCreated++;
    }
  }

  // 2. Find approved submissions that lack payoutBreakdown or have no netPayoutPaise
  const unbackfilledSubs = await Submission.find({
    status: SUBMISSION_STATUS.APPROVED,
    $or: [
      { payoutBreakdown: { $exists: false } },
      { 'payoutBreakdown.netPayoutPaise': { $exists: false } }
    ]
  }).populate('campaign').populate('application');

  for (const sub of unbackfilledSubs) {
    const creatorId = sub.creator._id || sub.creator;
    await ensureWallet(creatorId);

    const fee = sub.application?.feePaise
      || sub.campaign?.perCreatorFeePaise
      || 100000;

    const breakdown = calculateBreakdown(fee);
    const campaignTitle = sub.campaign?.title || 'Campaign';
    let brandName = '';
    if (sub.campaign?.brand?.name) {
      brandName = sub.campaign.brand.name;
    } else if (sub.campaign?.brand) {
      const bUser = await User.findById(sub.campaign.brand).select('name').lean();
      if (bUser) brandName = bUser.name;
    }

    try {
      await withTransaction(async (session) => {
        // Save breakdown onto submission
        sub.payoutBreakdown = breakdown;
        await Submission.findByIdAndUpdate(
          sub._id,
          { $set: { payoutBreakdown: breakdown } },
          { session, new: true }
        );

        // Credit creator wallet
        const updatedWallet = await Wallet.findOneAndUpdate(
          { user: creatorId },
          { $inc: { balancePaise: breakdown.netPayoutPaise } },
          { new: true, session }
        );

        if (!updatedWallet) {
          throw new Error(`Wallet not found for creator ${creatorId}`);
        }

        const balanceAfterPaise = updatedWallet.balancePaise;

        // Create LedgerEntry with unique idempotencyKey
        await LedgerEntry.create([
          {
            wallet: updatedWallet._id,
            user: creatorId,
            type: LEDGER_TYPE.PAYOUT_CREDIT,
            direction: LEDGER_DIRECTION.CREDIT,
            amountPaise: breakdown.netPayoutPaise,
            balanceAfterPaise,
            refType: 'submission',
            refId: sub._id,
            description: `Payout for ${campaignTitle}`,
            meta: {
              breakdown,
              campaignId: sub.campaign?._id || sub.campaign,
              campaignTitle,
              brandName
            },
            idempotencyKey: `payout:${sub._id}`
          }
        ], { session });
      });

      summary.submissionsProcessed++;
    } catch (err) {
      if (err.code === 11000 || (err.message && err.message.includes('duplicate key'))) {
        // Idempotency hit: already credited
        summary.submissionsSkipped++;
      } else {
        throw err;
      }
    }
  }

  return summary;
}

module.exports = {
  backfillWallets
};
