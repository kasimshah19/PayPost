const mongoose = require('mongoose');
const Application = require('../models/Application');
const Campaign = require('../models/Campaign');
const Submission = require('../models/Submission');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, ALLOWED_APPLICATION_TRANSITIONS } = require('../constants');
const withTransaction = require('../utils/withTransaction');
const { paiseToRupees } = require('../utils/money');

class ApplicationService {
  /**
   * Helper to perform status transitions and record history
   */
  _transition(application, newStatus, byId, note = null) {
    const currentStatus = application.status;
    const allowed = ALLOWED_APPLICATION_TRANSITIONS[currentStatus] || [];
    
    if (!allowed.includes(newStatus)) {
      const err = new Error(`Cannot transition application from ${currentStatus} to ${newStatus}`);
      err.status = 409;
      throw err;
    }

    application.status = newStatus;
    const historyEntry = {
      from: currentStatus,
      to: newStatus,
      by: byId,
      at: new Date()
    };
    if (note) historyEntry.note = note;
    application.statusHistory.push(historyEntry);

    if (newStatus === APPLICATION_STATUS.APPROVED) application.approvedAt = new Date();
    if (newStatus === APPLICATION_STATUS.REJECTED) application.rejectedAt = new Date();
    if (newStatus === APPLICATION_STATUS.WITHDRAWN) application.withdrawnAt = new Date();
    // cancelledAt is recorded by the cancel transition if needed
  }

  async applyToCampaign(campaignId, creatorId, pitch) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const err = new Error('Campaign not found'); err.status = 404; throw err;
    }

    if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
      const err = new Error('Campaign is not active'); err.status = 409; throw err;
    }

    if (new Date(campaign.applicationDeadline) < new Date()) {
      const err = new Error('Application deadline has passed'); err.status = 409; throw err;
    }

    if (campaign.slots - campaign.approvedCount <= 0) {
      const err = new Error('No slots left for this campaign'); err.status = 409; throw err;
    }

    const existingApp = await Application.findOne({ campaign: campaignId, creator: creatorId });

    if (existingApp) {
      if (existingApp.status === APPLICATION_STATUS.APPLIED || existingApp.status === APPLICATION_STATUS.APPROVED) {
        const err = new Error('You have already applied to this campaign'); err.status = 409; throw err;
      }
      
      // If withdrawn, check if they withdrew while 'applied'
      if (existingApp.status === APPLICATION_STATUS.WITHDRAWN) {
        // find the history entry where they withdrew
        const withdrawEntry = existingApp.statusHistory.slice().reverse().find(h => h.to === APPLICATION_STATUS.WITHDRAWN);
        if (withdrawEntry && withdrawEntry.from === APPLICATION_STATUS.APPLIED) {
          // Allowed to re-apply
          existingApp.status = APPLICATION_STATUS.APPLIED;
          existingApp.pitch = pitch;
          existingApp.statusHistory.push({
            from: APPLICATION_STATUS.WITHDRAWN,
            to: APPLICATION_STATUS.APPLIED,
            by: creatorId,
            note: 'Re-applied'
          });
          return await existingApp.save();
        } else {
          const err = new Error('You cannot re-apply after withdrawing from an approved slot'); err.status = 409; throw err;
        }
      }

      if (existingApp.status === APPLICATION_STATUS.REJECTED || existingApp.status === APPLICATION_STATUS.CANCELLED) {
        const err = new Error(`You cannot re-apply because your application was ${existingApp.status}`); err.status = 409; throw err;
      }

      const err = new Error('Invalid application state for re-applying'); err.status = 409; throw err;
    }

    // New application
    const app = new Application({
      campaign: campaignId,
      creator: creatorId,
      pitch,
      status: APPLICATION_STATUS.APPLIED,
      statusHistory: [{
        from: null,
        to: APPLICATION_STATUS.APPLIED,
        by: creatorId
      }]
    });

    return await app.save();
  }

  async withdrawApplication(applicationId, creatorId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const application = await Application.findById(applicationId).session(session);
      if (!application || application.creator.toString() !== creatorId) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      const hasSubmission = await Submission.exists({ application: applicationId }).session(session);
      if (hasSubmission) {
        const err = new Error('You have already submitted work and can no longer withdraw'); err.status = 409; throw err;
      }

      const oldStatus = application.status;

      this._transition(application, APPLICATION_STATUS.WITHDRAWN, creatorId);

      if (oldStatus === APPLICATION_STATUS.APPROVED) {
        // Release reservation
        const updatedCampaign = await Campaign.findOneAndUpdate(
          { _id: application.campaign, reservedPaise: { $gte: application.feePaise }, approvedCount: { $gte: 1 } },
          { $inc: { reservedPaise: -application.feePaise, approvedCount: -1 } },
          { session, new: true }
        );
        if (!updatedCampaign) {
          throw new Error('Failed to release campaign reservation. Concurrency mismatch.');
        }
      }

      await application.save({ session });
      return application;
    });
  }

  async approveApplication(applicationId, brandId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const application = await Application.findById(applicationId).populate('campaign').session(session);
      
      if (!application) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      const campaign = application.campaign;
      if (campaign.brand.toString() !== brandId) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
        const err = new Error('Campaign is not active'); err.status = 409; throw err;
      }
      
      if (new Date(campaign.submissionDeadline) < new Date()) {
        const err = new Error('Submission deadline has passed'); err.status = 409; throw err;
      }

      if (application.status !== APPLICATION_STATUS.APPLIED) {
        const err = new Error('Only applied applications can be approved'); err.status = 409; throw err;
      }

      const fee = campaign.perCreatorFeePaise;

      // Attempt atomic reservation on Campaign
      const updatedCampaign = await Campaign.findOneAndUpdate(
        {
          _id: campaign._id,
          perCreatorFeePaise: fee,
          $expr: {
            $and: [
              { $lt: ["$approvedCount", "$slots"] },
              { $lte: [{ $add: ["$reservedPaise", "$paidOutPaise", fee] }, "$budgetPaise"] }
            ]
          }
        },
        {
          $inc: { reservedPaise: fee, approvedCount: 1 }
        },
        { session, new: true }
      );

      if (!updatedCampaign) {
        // Find why it failed
        const currentCampaign = await Campaign.findById(campaign._id).session(session);
        if (currentCampaign.slots - currentCampaign.approvedCount <= 0) {
          const err = new Error('No slots left'); err.status = 409; throw err;
        }
        if (currentCampaign.budgetPaise - (currentCampaign.reservedPaise + currentCampaign.paidOutPaise) < fee) {
          const err = new Error(`Not enough budget: ₹${paiseToRupees(currentCampaign.budgetPaise - currentCampaign.reservedPaise - currentCampaign.paidOutPaise)} available, ₹${paiseToRupees(fee)} needed`);
          err.status = 409;
          throw err;
        }
        if (currentCampaign.perCreatorFeePaise !== fee) {
          const err = new Error('Campaign fee was changed during approval. Please try again.'); err.status = 409; throw err;
        }
        const err = new Error('Failed to reserve slot and budget'); err.status = 409; throw err;
      }

      // Transition application
      this._transition(application, APPLICATION_STATUS.APPROVED, brandId);
      application.feePaise = fee;
      
      await application.save({ session });
      
      // TODO Phase 8: notify creator of approval

      return { application, campaign: updatedCampaign };
    });
  }

  async rejectApplication(applicationId, note, brandId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const application = await Application.findById(applicationId).populate('campaign');
    if (!application || application.campaign.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (application.status === APPLICATION_STATUS.APPROVED) {
      const err = new Error('Approved creators cannot be removed'); err.status = 409; throw err;
    }

    this._transition(application, APPLICATION_STATUS.REJECTED, brandId, note);
    
    await application.save();

    // TODO Phase 8: notify creator of rejection

    return application;
  }

  async listCampaignApplications(campaignId, brandId, statusFilter) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign || campaign.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const query = { campaign: campaignId };
    if (statusFilter) query.status = statusFilter;

    const applications = await Application.find(query)
      .populate('creator', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const mapped = applications.map(app => ({
      _id: app._id,
      creator: {
        _id: app.creator._id,
        name: app.creator.name
      },
      pitch: app.pitch,
      status: app.status,
      feePaise: app.feePaise,
      createdAt: app.createdAt,
      approvedAt: app.approvedAt,
      statusHistory: app.statusHistory
    }));

    const header = {
      slots: campaign.slots,
      approvedCount: campaign.approvedCount,
      slotsLeft: campaign.slots - campaign.approvedCount,
      budgetPaise: campaign.budgetPaise,
      reservedPaise: campaign.reservedPaise,
      paidOutPaise: campaign.paidOutPaise,
      availablePaise: campaign.budgetPaise - campaign.reservedPaise - campaign.paidOutPaise,
      perCreatorFeePaise: campaign.perCreatorFeePaise,
      canApproveMore: (campaign.slots - campaign.approvedCount > 0) && (campaign.budgetPaise - campaign.reservedPaise - campaign.paidOutPaise >= campaign.perCreatorFeePaise)
    };

    return { applications: mapped, header };
  }

  async listMyApplications(creatorId, statusFilter) {
    const query = { creator: creatorId };
    if (statusFilter) query.status = statusFilter;

    const applications = await Application.find(query)
      .populate({
        path: 'campaign',
        select: 'title brand perCreatorFeePaise submissionDeadline status',
        populate: { path: 'brand', select: 'name' }
      })
      .sort({ createdAt: -1 })
      .lean();

    // Attach canWithdraw to each
    const mapped = await Promise.all(applications.map(async (app) => {
      const canWithdraw = (app.status === APPLICATION_STATUS.APPLIED || app.status === APPLICATION_STATUS.APPROVED) 
          && !(await Submission.exists({ application: app._id }));

      return {
        _id: app._id,
        campaign: {
          _id: app.campaign._id,
          title: app.campaign.title,
          brandName: app.campaign.brand ? app.campaign.brand.name : 'Brand',
          perCreatorFeePaise: app.campaign.perCreatorFeePaise,
          submissionDeadline: app.campaign.submissionDeadline,
          status: app.campaign.status
        },
        status: app.status,
        feePaise: app.feePaise,
        createdAt: app.createdAt,
        statusHistory: app.statusHistory,
        canWithdraw
      };
    }));

    return mapped;
  }
}

module.exports = new ApplicationService();
