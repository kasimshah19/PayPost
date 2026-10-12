const Campaign = require('../models/Campaign');
const Submission = require('../models/Submission');
const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const User = require('../models/User');
const { LEDGER_TYPE, LEDGER_DIRECTION, NOTIFICATION_EVENTS } = require('../constants');
const { calculateBreakdown } = require('./feeCalculator');
const notificationService = require('./notificationService');
const { emitToUser, afterCommit, EVENTS } = require('../realtime');

/**
 * Settles an approved submission inside an active MongoDB session / transaction:
 * 1. Atomically shifts application.feePaise from campaign.reservedPaise to campaign.paidOutPaise.
 * 2. Computes the fee breakdown (platform fee, GST, TDS, net payout).
 * 3. Saves breakdown snapshot into submission.payoutBreakdown.
 * 4. Atomically credits the creator's wallet balance with netPayoutPaise.
 * 5. Writes an immutable LedgerEntry with unique idempotencyKey `payout:<submissionId>`.
 * 
 * Note: Platform fee, GST, and TDS are not credited to any user wallet; in a production banking system,
 * these would be booked to platform revenue and tax payable ledger accounts.
 */
async function settleApprovedSubmission(session, { campaign, application, submission }) {
  const fee = application.feePaise;
  const campaignId = campaign._id || campaign;

  // a) Atomic campaign update: reservedPaise -= fee, paidOutPaise += fee
  const updatedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      reservedPaise: { $gte: fee }
    },
    {
      $inc: {
        reservedPaise: -fee,
        paidOutPaise: fee
      }
    },
    { session, new: true }
  );

  if (!updatedCampaign) {
    const err = new Error('Failed to update campaign balances. Insufficient reserved funds.');
    err.status = 409;
    throw err;
  }

  // b) calculate breakdown
  const breakdown = calculateBreakdown(fee);

  // c) save breakdown into submission.payoutBreakdown
  submission.payoutBreakdown = breakdown;
  await Submission.findByIdAndUpdate(
    submission._id,
    { $set: { payoutBreakdown: breakdown } },
    { session, new: true }
  );

  const creatorId = submission.creator?._id || submission.creator || application.creator?._id || application.creator;

  // d) atomically credit the wallet
  const updatedWallet = await Wallet.findOneAndUpdate(
    { user: creatorId },
    { $inc: { balancePaise: breakdown.netPayoutPaise } },
    { new: true, session }
  );

  if (!updatedWallet) {
    const err = new Error('Creator wallet not found');
    err.status = 404;
    throw err;
  }

  const balanceAfterPaise = updatedWallet.balancePaise;

  const campaignTitle = campaign.title || 'Campaign';

  // Notify creator that payout was credited
  await notificationService.notify({
    recipientId: creatorId,
    event: NOTIFICATION_EVENTS.PAYOUT_CREDITED,
    dedupeRefId: submission._id.toString(),
    payload: {
      campaignTitle,
      netPayoutPaise: breakdown.netPayoutPaise
    },
    session
  });

  // Extract brand and campaign details for ledger meta
  let brandName = '';
  if (campaign.brand && campaign.brand.name) {
    brandName = campaign.brand.name;
  } else if (campaign.brand) {
    const brandUser = await User.findById(campaign.brand).select('name').lean();
    if (brandUser) brandName = brandUser.name;
  }

  // e) create a LedgerEntry with unique idempotencyKey
  // If duplicate idempotencyKey (payout already made), MongoDB throws E11000 and aborts the entire transaction.
  await LedgerEntry.create([
    {
      wallet: updatedWallet._id,
      user: creatorId,
      type: LEDGER_TYPE.PAYOUT_CREDIT,
      direction: LEDGER_DIRECTION.CREDIT,
      amountPaise: breakdown.netPayoutPaise,
      balanceAfterPaise,
      refType: 'submission',
      refId: submission._id,
      description: `Payout for ${campaignTitle}`,
      meta: {
        breakdown,
        campaignId,
        campaignTitle,
        brandName
      },
      idempotencyKey: `payout:${submission._id}`
    }
  ], { session });

  afterCommit(session, () => {
    emitToUser(creatorId, EVENTS.WALLET_CHANGED, {
      reason: 'payout_credited',
      amountPaise: breakdown.netPayoutPaise,
      showToast: true
    });
  });

  return updatedCampaign;
}

module.exports = {
  settleApprovedSubmission
};
