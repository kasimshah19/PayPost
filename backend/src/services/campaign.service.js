const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Application = require('../models/Application');
const Submission = require('../models/Submission');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS, NOTIFICATION_EVENTS } = require('../constants');
const withTransaction = require('../utils/withTransaction');
const { paiseToRupees } = require('../utils/money');
const { calculateBreakdown } = require('./feeCalculator');
const notificationService = require('./notificationService');

class CampaignService {
  async create(data, brandId) {
    const campaign = new Campaign({
      ...data,
      brand: brandId,
      status: CAMPAIGN_STATUS.ACTIVE,
      reservedPaise: 0,
      paidOutPaise: 0,
      approvedCount: 0
    });
    return await campaign.save();
  }

  async getMine(brandId, { page = 1, limit = 20, status }) {
    const query = { brand: brandId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Attach counts
    const populated = await Promise.all(campaigns.map(async (c) => {
      // Aggregate applications for this campaign
      const appCounts = await Application.aggregate([
        { $match: { campaign: c._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const applicantCounts = { applied: 0, approved: 0, rejected: 0, withdrawn: 0, completed: 0, cancelled: 0 };
      appCounts.forEach(ag => { if (applicantCounts[ag._id] !== undefined) applicantCounts[ag._id] = ag.count; });

      // Aggregate submissions for this campaign
      const subCounts = await Submission.aggregate([
        { $match: { campaign: c._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const submissionCounts = { submitted: 0, revision_requested: 0, approved: 0, rejected: 0 };
      subCounts.forEach(ag => { if (submissionCounts[ag._id] !== undefined) submissionCounts[ag._id] = ag.count; });

      return {
        ...c,
        availablePaise: c.budgetPaise - c.reservedPaise - c.paidOutPaise,
        slotsLeft: c.slots - c.approvedCount,
        applicantCounts,
        submissionCounts,
        pendingReviewCount: submissionCounts.submitted
      };
    }));

    return populated;
  }

  async getMineSummary(brandId) {
    const campaigns = await Campaign.find({ brand: brandId, status: { $ne: CAMPAIGN_STATUS.CANCELLED } });
    const campaignIds = campaigns.map(c => c._id);
    
    const pendingReviewCount = await Submission.countDocuments({
      campaign: { $in: campaignIds },
      status: SUBMISSION_STATUS.SUBMITTED
    });

    const summary = {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === CAMPAIGN_STATUS.ACTIVE).length,
      pendingReviewCount,
      totalBudgetPaise: 0,
      totalReservedPaise: 0,
      totalPaidOutPaise: 0,
      totalAvailablePaise: 0
    };

    campaigns.forEach(c => {
      summary.totalBudgetPaise += c.budgetPaise;
      summary.totalReservedPaise += c.reservedPaise;
      summary.totalPaidOutPaise += c.paidOutPaise;
      summary.totalAvailablePaise += (c.budgetPaise - c.reservedPaise - c.paidOutPaise);
    });

    return summary;
  }

  async browseCreator({ page = 1, limit = 20 }, creatorId) {
    const skip = (page - 1) * limit;

    const query = {
      status: CAMPAIGN_STATUS.ACTIVE,
      applicationDeadline: { $gt: new Date() },
      $expr: { $gt: ["$slots", "$approvedCount"] }
    };

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('brand', 'name')
      .lean();

    // Map output to remove sensitive fields
    const mapped = await Promise.all(campaigns.map(async (c) => {
      const myApplication = await Application.findOne({ campaign: c._id, creator: creatorId }).lean();
      const feeBreakdown = calculateBreakdown(c.perCreatorFeePaise);
      const estimatedPayout = {
        netPayoutPaise: feeBreakdown.netPayoutPaise,
        platformFeePaise: feeBreakdown.platformFeePaise,
        gstPaise: feeBreakdown.gstPaise,
        tdsPaise: feeBreakdown.tdsPaise
      };
      
      return {
        _id: c._id,
        title: c.title,
        description: c.description,
        perCreatorFeePaise: c.perCreatorFeePaise,
        estimatedPayout,
        slots: c.slots,
        slotsLeft: c.slots - c.approvedCount,
        applicationDeadline: c.applicationDeadline,
        submissionDeadline: c.submissionDeadline,
        brand: c.brand,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        myApplicationStatus: myApplication ? myApplication.status : null
      };
    }));

    return mapped;
  }

  async getById(id, user) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Not Found');
      err.status = 404;
      throw err;
    }

    const campaign = await Campaign.findById(id).populate('brand', 'name').lean();
    if (!campaign) {
      const err = new Error('Not Found');
      err.status = 404;
      throw err;
    }

    if (user.role === 'brand') {
      if (campaign.brand._id.toString() !== user.id) {
        const err = new Error('Not Found');
        err.status = 404;
        throw err;
      }

      // Populate counts
      const appCounts = await Application.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const applicantCounts = { applied: 0, approved: 0, rejected: 0, withdrawn: 0, completed: 0, cancelled: 0 };
      appCounts.forEach(ag => { if (applicantCounts[ag._id] !== undefined) applicantCounts[ag._id] = ag.count; });

      const subCounts = await Submission.aggregate([
        { $match: { campaign: campaign._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const submissionCounts = { submitted: 0, revision_requested: 0, approved: 0, rejected: 0 };
      subCounts.forEach(ag => { if (submissionCounts[ag._id] !== undefined) submissionCounts[ag._id] = ag.count; });

      campaign.applicantCounts = applicantCounts;
      campaign.submissionCounts = submissionCounts;
      campaign.pendingReviewCount = submissionCounts.submitted;
      campaign.availablePaise = campaign.budgetPaise - campaign.reservedPaise - campaign.paidOutPaise;
      campaign.slotsLeft = campaign.slots - campaign.approvedCount;

      const hasApprovals = campaign.approvedCount > 0 || campaign.reservedPaise > 0 || campaign.paidOutPaise > 0;
      
      campaign.editRules = {
        hasApprovals,
        minBudgetPaise: campaign.reservedPaise + campaign.paidOutPaise,
        minSlots: campaign.approvedCount,
        canEdit: campaign.status !== CAMPAIGN_STATUS.CANCELLED,
        canCancel: campaign.status !== CAMPAIGN_STATUS.CANCELLED
      };

      return campaign;
    } else if (user.role === 'creator') {
      const myApplication = await Application.findOne({ campaign: campaign._id, creator: user.id }).lean();
      let submissionData = null;
      if (myApplication) {
        const sub = myApplication.submission
          ? await Submission.findById(myApplication.submission).select('_id status').lean()
          : await Submission.findOne({ application: myApplication._id }).select('_id status').lean();
        if (sub) {
          submissionData = { id: sub._id, _id: sub._id, status: sub.status };
        }
      }

      const feeBreakdown = calculateBreakdown(campaign.perCreatorFeePaise);
      const estimatedPayout = {
        netPayoutPaise: feeBreakdown.netPayoutPaise,
        platformFeePaise: feeBreakdown.platformFeePaise,
        gstPaise: feeBreakdown.gstPaise,
        tdsPaise: feeBreakdown.tdsPaise
      };

      return {
        _id: campaign._id,
        title: campaign.title,
        description: campaign.description,
        perCreatorFeePaise: campaign.perCreatorFeePaise,
        estimatedPayout,
        slots: campaign.slots,
        slotsLeft: campaign.slots - campaign.approvedCount,
        applicationDeadline: campaign.applicationDeadline,
        submissionDeadline: campaign.submissionDeadline,
        brand: campaign.brand,
        status: campaign.status,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        myApplicationStatus: myApplication ? myApplication.status : null,
        myApplicationId: myApplication ? myApplication._id : null,
        myApplication: myApplication ? {
          _id: myApplication._id,
          id: myApplication._id,
          status: myApplication.status,
          feePaise: myApplication.feePaise,
          submission: submissionData
        } : null
      };
    }
  }

  async update(id, updates, brandId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    
    const campaign = await Campaign.findById(id);
    if (!campaign || campaign.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (campaign.status === CAMPAIGN_STATUS.CANCELLED) {
      const err = new Error('Cannot edit a cancelled campaign'); err.status = 409; throw err;
    }

    const hasApprovals = campaign.approvedCount > 0 || campaign.reservedPaise > 0 || campaign.paidOutPaise > 0;

    // Merge for validation
    const merged = { ...campaign.toObject(), ...updates };

    const minBudget = campaign.reservedPaise + campaign.paidOutPaise;
    if (merged.budgetPaise < minBudget) {
      const err = new Error(`Budget cannot be less than reserved + paid out (₹${paiseToRupees(minBudget)})`); err.status = 400; throw err;
    }
    if (merged.budgetPaise < merged.perCreatorFeePaise) {
      const err = new Error('Budget cannot be less than per creator fee'); err.status = 400; throw err;
    }

    if (merged.slots < campaign.approvedCount) {
      const err = new Error(`Slots cannot be less than already approved count (${campaign.approvedCount})`); err.status = 400; throw err;
    }

    if (hasApprovals) {
      if (updates.applicationDeadline && new Date(updates.applicationDeadline) < campaign.applicationDeadline) {
        const err = new Error('Application deadline can only be extended once approvals exist'); err.status = 400; throw err;
      }
      if (updates.submissionDeadline && new Date(updates.submissionDeadline) < campaign.submissionDeadline) {
        const err = new Error('Submission deadline can only be extended once approvals exist'); err.status = 400; throw err;
      }
    }

    if (new Date(merged.submissionDeadline) <= new Date(merged.applicationDeadline)) {
      const err = new Error('Submission deadline must be after application deadline'); err.status = 400; throw err;
    }
    if (new Date(merged.submissionDeadline) <= new Date()) {
       const err = new Error('Submission deadline must be in the future'); err.status = 400; throw err;
    }

    // Check if submission deadline was extended into the future
    const isDeadlineExtended = updates.submissionDeadline &&
      new Date(updates.submissionDeadline).getTime() > new Date(campaign.submissionDeadline).getTime();

    // Apply allowed fields
    const allowed = ['title', 'description', 'budgetPaise', 'perCreatorFeePaise', 'slots', 'applicationDeadline', 'submissionDeadline'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        campaign[key] = updates[key];
      }
    }

    const savedCampaign = await campaign.save();

    // If submission deadline moved later, notify all approved creators on this campaign
    if (isDeadlineExtended) {
      const approvedApps = await Application.find({
        campaign: savedCampaign._id,
        status: APPLICATION_STATUS.APPROVED
      }).select('creator').lean();

      for (const app of approvedApps) {
        const timestampSuffix = new Date(savedCampaign.submissionDeadline).getTime();
        await notificationService.notify({
          recipientId: app.creator,
          event: NOTIFICATION_EVENTS.CAMPAIGN_DEADLINE_EXTENDED,
          refId: `${savedCampaign._id}:${timestampSuffix}`,
          payload: {
            campaignId: savedCampaign._id,
            campaignTitle: savedCampaign.title,
            newSubmissionDeadline: savedCampaign.submissionDeadline
          }
        });
      }
    }

    return savedCampaign;
  }

  async cancel(id, cancelReason, brandId) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    
    return await withTransaction(async (session) => {
      const campaign = await Campaign.findById(id).session(session);
      if (!campaign || campaign.brand.toString() !== brandId.toString()) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      if (campaign.status === CAMPAIGN_STATUS.CANCELLED) {
        const err = new Error('Campaign is already cancelled'); err.status = 409; throw err;
      }

      const pendingSubmissions = await Submission.countDocuments({
        campaign: id,
        $or: [
          { status: SUBMISSION_STATUS.SUBMITTED },
          {
            status: SUBMISSION_STATUS.REVISION_REQUESTED,
            $or: [
              { revisionDueAt: { $exists: false } },
              { revisionDueAt: null },
              { revisionDueAt: { $gt: new Date() } }
            ]
          }
        ]
      }).session(session);

      if (pendingSubmissions > 0) {
        const err = new Error(`Cannot cancel campaign: ${pendingSubmissions} submissions need review.`); err.status = 409; throw err;
      }

      // Update Campaign
      campaign.status = CAMPAIGN_STATUS.CANCELLED;
      campaign.cancelReason = cancelReason;
      campaign.cancelledAt = new Date();

      // Find applications to cancel (applied or approved)
      const apps = await Application.find({
        campaign: id,
        status: { $in: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.APPROVED] }
      }).session(session);

      let releasedPaise = 0;
      let releasedSlots = 0;
      const affectedCreatorIds = [];

      for (const app of apps) {
        const oldStatus = app.status;
        app.status = APPLICATION_STATUS.CANCELLED;
        app.statusHistory.push({
          from: oldStatus,
          to: APPLICATION_STATUS.CANCELLED,
          by: brandId,
          note: cancelReason
        });
        
        if (oldStatus === APPLICATION_STATUS.APPROVED) {
          releasedPaise += app.feePaise;
          releasedSlots += 1;
        }

        affectedCreatorIds.push(app.creator);
        await app.save({ session });
      }

      campaign.reservedPaise = Math.max(0, campaign.reservedPaise - releasedPaise);
      campaign.approvedCount = Math.max(0, campaign.approvedCount - releasedSlots);

      await campaign.save({ session });

      // Notify EVERY creator whose application became cancelled
      if (affectedCreatorIds.length > 0) {
        await notificationService.notifyMany(affectedCreatorIds, {
          event: NOTIFICATION_EVENTS.CAMPAIGN_CANCELLED,
          refId: campaign._id,
          payload: {
            campaignId: campaign._id,
            campaignTitle: campaign.title,
            cancelReason
          },
          session
        });
      }

      return campaign;
    });
  }
}

module.exports = new CampaignService();
