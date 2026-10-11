const { paiseToRupees } = require('../utils/money');
const { CAMPAIGN_STATUS } = require('../constants');

/**
 * Evaluates whether an application on a campaign can be approved by the brand.
 * Returns { canApprove: boolean, cannotApproveReason: string | null }
 *
 * Rules:
 * 1. Campaign must be active
 * 2. Submission deadline must not have passed
 * 3. Slots must be available (approvedCount < slots)
 * 4. Available budget must cover perCreatorFeePaise
 */
function evaluateApprovability(campaign) {
  if (!campaign) {
    return { canApprove: false, cannotApproveReason: 'Campaign not found' };
  }

  if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
    return { canApprove: false, cannotApproveReason: 'Campaign is not active' };
  }

  if (new Date(campaign.submissionDeadline) < new Date()) {
    return { canApprove: false, cannotApproveReason: 'Submission deadline has passed' };
  }

  const slotsLeft = campaign.slots - (campaign.approvedCount || 0);
  if (slotsLeft <= 0) {
    return { canApprove: false, cannotApproveReason: 'No slots left' };
  }

  const fee = campaign.perCreatorFeePaise;
  const availablePaise = campaign.budgetPaise - (campaign.reservedPaise || 0) - (campaign.paidOutPaise || 0);
  if (availablePaise < fee) {
    return {
      canApprove: false,
      cannotApproveReason: `Not enough budget: ₹${paiseToRupees(availablePaise)} available, ₹${paiseToRupees(fee)} needed`
    };
  }

  return { canApprove: true, cannotApproveReason: null };
}

module.exports = {
  evaluateApprovability
};
