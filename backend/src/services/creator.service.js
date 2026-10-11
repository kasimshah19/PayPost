const Application = require('../models/Application');
const Submission = require('../models/Submission');
const Withdrawal = require('../models/Withdrawal');
const { APPLICATION_STATUS, SUBMISSION_STATUS, CAMPAIGN_STATUS, WITHDRAWAL_STATUS } = require('../constants');

class CreatorService {
  async getNextActions(creatorId) {
    const items = [];
    const now = new Date();

    // 1. Submit work: own application "approved" with no submission on an active campaign
    const approvedApps = await Application.find({
      creator: creatorId,
      status: APPLICATION_STATUS.APPROVED
    })
      .populate('campaign')
      .lean();

    for (const app of approvedApps) {
      const camp = app.campaign;
      if (!camp || camp.status !== CAMPAIGN_STATUS.ACTIVE) {
        continue;
      }

      // Check if a submission already exists for this application
      if (app.submission) {
        continue;
      }
      const existingSub = await Submission.exists({ application: app._id });
      if (existingSub) {
        continue;
      }

      const dueAt = camp.submissionDeadline ? new Date(camp.submissionDeadline) : null;
      const isOverdue = dueAt ? dueAt < now : false;

      items.push({
        type: 'submit_work',
        title: `Submit your post for ${camp.title}`,
        hint: isOverdue ? 'Deadline passed' : 'Submit your post before the deadline',
        campaignId: camp._id,
        campaignTitle: camp.title,
        applicationId: app._id,
        dueAt: dueAt ? dueAt.toISOString() : null,
        overdue: isOverdue,
        path: `/creator/campaigns/${camp._id}?tab=submissions`
      });
    }

    // 2. Resubmit: own submission "revision_requested" on an active campaign
    const revisionSubs = await Submission.find({
      creator: creatorId,
      status: SUBMISSION_STATUS.REVISION_REQUESTED
    })
      .populate('campaign')
      .lean();

    for (const sub of revisionSubs) {
      const camp = sub.campaign;
      if (!camp || camp.status !== CAMPAIGN_STATUS.ACTIVE) {
        continue;
      }

      const dueAt = sub.revisionDueAt ? new Date(sub.revisionDueAt) : null;
      const isOverdue = dueAt ? dueAt < now : false;

      items.push({
        type: 'resubmit',
        title: `Revision requested on ${camp.title}`,
        hint: isOverdue ? 'Revision deadline passed' : 'Update your post and resubmit',
        campaignId: camp._id,
        campaignTitle: camp.title,
        submissionId: sub._id,
        dueAt: dueAt ? dueAt.toISOString() : null,
        overdue: isOverdue,
        path: `/creator/campaigns/${camp._id}?tab=submissions`
      });
    }

    // 3. Withdrawal failed: the creator's MOST RECENT withdrawal has status "failed" and failed within the last 7 days;
    // path "/creator/wallet?retry=<id>"; it disappears once a newer withdrawal exists.
    const latestWithdrawal = await Withdrawal.findOne({ user: creatorId })
      .sort({ createdAt: -1 })
      .lean();

    if (latestWithdrawal && latestWithdrawal.status === WITHDRAWAL_STATUS.FAILED) {
      const failedTime = latestWithdrawal.processedAt || latestWithdrawal.updatedAt || latestWithdrawal.createdAt;
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (new Date(failedTime) >= sevenDaysAgo) {
        items.push({
          type: 'withdrawal_failed',
          title: 'Withdrawal failed, try again',
          hint: latestWithdrawal.failureReason || 'Your previous withdrawal failed. You can retry with an updated UPI ID.',
          withdrawalId: latestWithdrawal._id,
          overdue: false,
          path: `/creator/wallet?retry=${latestWithdrawal._id}`
        });
      }
    }

    // Sorting: items with a dueAt come first, soonest first (overdue ones first), then the rest.
    items.sort((a, b) => {
      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt) - new Date(b.dueAt);
      }
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return 0;
    });

    return {
      counts: {
        total: items.length
      },
      items
    };
  }
}

module.exports = new CreatorService();
