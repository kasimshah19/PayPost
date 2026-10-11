const Campaign = require('../models/Campaign');

/**
 * Settles an approved submission.
 * In Phase 5: atomically shifts application.feePaise from campaign.reservedPaise to campaign.paidOutPaise.
 * 
 * // TODO Phase 6: compute platform fee, GST, TDS, save submission.payoutBreakdown, credit the creator wallet and write a ledger entry here, in the same transaction
 */
async function settleApprovedSubmission(session, { campaign, application, submission }) {
  const fee = application.feePaise;

  const campaignId = campaign._id || campaign;

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

  // TODO Phase 6: compute platform fee, GST, TDS, save submission.payoutBreakdown, credit the creator wallet and write a ledger entry here, in the same transaction

  return updatedCampaign;
}

module.exports = {
  settleApprovedSubmission
};
