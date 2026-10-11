const mongoose = require('mongoose');
const Application = require('../models/Application');
const Campaign = require('../models/Campaign');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, ALLOWED_APPLICATION_TRANSITIONS, NOTIFICATION_EVENTS } = require('../constants');
const withTransaction = require('../utils/withTransaction');
const { paiseToRupees } = require('../utils/money');
const { evaluateApprovability } = require('../utils/campaignApprovability');
const notificationService = require('./notificationService');

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

    return await withTransaction(async (session) => {
      const campaign = await Campaign.findById(campaignId).session(session);
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

      const creator = await User.findById(creatorId).select('name').session(session);
      const existingApp = await Application.findOne({ campaign: campaignId, creator: creatorId }).session(session);

      if (existingApp) {
        if (existingApp.status === APPLICATION_STATUS.APPLIED || existingApp.status === APPLICATION_STATUS.APPROVED) {
          const err = new Error('You have already applied to this campaign'); err.status = 409; throw err;
        }
        
        // If withdrawn, check if they withdrew while 'applied'
        if (existingApp.status === APPLICATION_STATUS.WITHDRAWN) {
          const withdrawEntry = existingApp.statusHistory.slice().reverse().find(h => h.to === APPLICATION_STATUS.WITHDRAWN);
          if (withdrawEntry && withdrawEntry.from === APPLICATION_STATUS.APPLIED) {
            existingApp.status = APPLICATION_STATUS.APPLIED;
            existingApp.pitch = pitch;
            existingApp.statusHistory.push({
              from: APPLICATION_STATUS.WITHDRAWN,
              to: APPLICATION_STATUS.APPLIED,
              by: creatorId,
              note: 'Re-applied'
            });
            const saved = await existingApp.save({ session });

            // Notify brand of re-application
            await notificationService.notify({
              recipientId: campaign.brand,
              event: NOTIFICATION_EVENTS.APPLICATION_RECEIVED,
              refId: saved._id,
              payload: {
                campaignId: campaign._id,
                campaignTitle: campaign.title,
                creatorName: creator?.name
              },
              session
            });

            return saved;
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

      const savedApp = await app.save({ session });

      // Notify brand of application received
      await notificationService.notify({
        recipientId: campaign.brand,
        event: NOTIFICATION_EVENTS.APPLICATION_RECEIVED,
        refId: savedApp._id,
        payload: {
          campaignId: campaign._id,
          campaignTitle: campaign.title,
          creatorName: creator?.name
        },
        session
      });

      return savedApp;
    });
  }

  async withdrawApplication(applicationId, creatorId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const application = await Application.findOne({
        _id: applicationId,
        creator: creatorId,
        status: { $in: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.APPROVED] },
        submission: null
      }).session(session);

      if (!application) {
        const existing = await Application.findById(applicationId).session(session);
        if (!existing || existing.creator.toString() !== creatorId) {
          const err = new Error('Not Found'); err.status = 404; throw err;
        }
        if (existing.submission || (await Submission.exists({ application: applicationId }).session(session))) {
          const err = new Error('You have already submitted work and can no longer withdraw'); err.status = 409; throw err;
        }
        const err = new Error(`Cannot transition application from ${existing.status} to ${APPLICATION_STATUS.WITHDRAWN}`);
        err.status = 409;
        throw err;
      }

      const hasSubmission = await Submission.exists({ application: applicationId }).session(session);
      if (hasSubmission) {
        const err = new Error('You have already submitted work and can no longer withdraw'); err.status = 409; throw err;
      }

      const oldStatus = application.status;
      const campaign = await Campaign.findById(application.campaign).session(session);
      const creator = await User.findById(creatorId).select('name').session(session);

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

      // Notify brand that application was withdrawn
      if (campaign) {
        await notificationService.notify({
          recipientId: campaign.brand,
          event: NOTIFICATION_EVENTS.APPLICATION_WITHDRAWN,
          refId: `${application._id}withdrawn`,
          payload: {
            campaignId: campaign._id,
            campaignTitle: campaign.title,
            creatorName: creator?.name,
            wasApproved: oldStatus === APPLICATION_STATUS.APPROVED
          },
          session
        });
      }

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
      if (campaign.brand.toString() !== brandId.toString()) {
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
        const currentCampaign = await Campaign.findById(campaign._id).session(session);
        const { cannotApproveReason } = evaluateApprovability(currentCampaign);
        if (cannotApproveReason) {
          const err = new Error(cannotApproveReason);
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
      
      // Notify creator of approval
      await notificationService.notify({
        recipientId: application.creator,
        event: NOTIFICATION_EVENTS.APPLICATION_APPROVED,
        refId: application._id,
        payload: {
          campaignId: campaign._id,
          campaignTitle: campaign.title,
          feePaise: fee,
          submissionDeadline: campaign.submissionDeadline
        },
        session
      });

      return { application, campaign: updatedCampaign };
    });
  }

  async rejectApplication(applicationId, note, brandId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const application = await Application.findById(applicationId).populate('campaign').session(session);
      if (!application || application.campaign.brand.toString() !== brandId) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      if (application.status === APPLICATION_STATUS.APPROVED) {
        const err = new Error('Approved creators cannot be removed'); err.status = 409; throw err;
      }

      this._transition(application, APPLICATION_STATUS.REJECTED, brandId, note);
      
      await application.save({ session });

      // Notify creator of rejection
      await notificationService.notify({
        recipientId: application.creator,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        refId: application._id,
        payload: {
          campaignId: application.campaign._id,
          campaignTitle: application.campaign.title
        },
        session
      });

      return application;
    });
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

    const mapped = await Promise.all(applications.map(async (app) => {
      let submissionData = null;
      if (app.submission) {
        submissionData = {
          id: app.submission._id || app.submission,
          _id: app.submission._id || app.submission,
          status: app.submission.status
        };
      } else {
        const sub = await Submission.findOne({ application: app._id }).select('_id status').lean();
        if (sub) {
          submissionData = { id: sub._id, _id: sub._id, status: sub.status };
        }
      }

      return {
        _id: app._id,
        creator: {
          _id: app.creator._id,
          name: app.creator.name
        },
        pitch: app.pitch,
        status: app.status,
        feePaise: app.feePaise,
        submission: submissionData,
        createdAt: app.createdAt,
        approvedAt: app.approvedAt,
        statusHistory: app.statusHistory
      };
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

    // Attach canWithdraw and submission to each
    const mapped = await Promise.all(applications.map(async (app) => {
      let submissionData = null;
      const sub = app.submission
        ? await Submission.findById(app.submission).select('_id status').lean()
        : await Submission.findOne({ application: app._id }).select('_id status').lean();
      if (sub) {
        submissionData = { id: sub._id, _id: sub._id, status: sub.status };
      }

      const canWithdraw = (app.status === APPLICATION_STATUS.APPLIED || app.status === APPLICATION_STATUS.APPROVED) 
          && !submissionData;

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
        submission: submissionData,
        canWithdraw
      };
    }));

    return mapped;
  }
}

module.exports = new ApplicationService();
