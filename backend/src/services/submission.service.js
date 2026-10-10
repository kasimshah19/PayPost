const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Application = require('../models/Application');
const Campaign = require('../models/Campaign');
const { SUBMISSION_STATUS, APPLICATION_STATUS, MAX_REVISIONS, FEE_CONFIG } = require('../constants');
const withTransaction = require('../utils/withTransaction');

class SubmissionService {
  /**
   * Calculate payouts (Phase 5 sets the stage for Phase 6)
   */
  _calculatePayoutBreakdown(grossFeePaise) {
    const platformFeePaise = Math.floor(grossFeePaise * (FEE_CONFIG.PLATFORM_FEE_PERCENT / 100));
    const gstPaise = Math.floor(platformFeePaise * (FEE_CONFIG.GST_PERCENT_ON_PLATFORM_FEE / 100));
    const tdsPaise = Math.floor(grossFeePaise * (FEE_CONFIG.TDS_PERCENT_ON_PAYOUT / 100));
    
    // Net Payout = Gross Fee - (Platform Fee + GST) - TDS
    const netPayoutPaise = grossFeePaise - (platformFeePaise + gstPaise) - tdsPaise;
    
    return {
      grossFeePaise,
      platformFeePaise,
      gstPaise,
      tdsPaise,
      netPayoutPaise
    };
  }

  async submitWork(applicationId, creatorId, postUrl, note) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const application = await Application.findById(applicationId).populate('campaign').session(session);
      if (!application || application.creator.toString() !== creatorId) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      if (application.status !== APPLICATION_STATUS.APPROVED) {
        const err = new Error('You can only submit work for approved applications'); err.status = 409; throw err;
      }

      const campaign = application.campaign;
      if (new Date(campaign.submissionDeadline) < new Date()) {
        const err = new Error('Submission deadline has passed'); err.status = 409; throw err;
      }

      let submission = await Submission.findOne({ application: applicationId }).session(session);

      if (submission) {
        // Handle revision
        if (submission.status !== SUBMISSION_STATUS.REVISION_REQUESTED) {
          const err = new Error(`Cannot update submission in ${submission.status} state`); err.status = 409; throw err;
        }
        
        if (submission.revisionCount >= MAX_REVISIONS) {
          const err = new Error('Maximum revisions reached'); err.status = 409; throw err;
        }

        submission.revisionCount += 1;
        submission.status = SUBMISSION_STATUS.SUBMITTED;
        submission.postUrl = postUrl; // update active URL
        submission.versions.push({ postUrl, note });
      } else {
        // First time submission
        submission = new Submission({
          application: applicationId,
          campaign: campaign._id,
          creator: creatorId,
          brand: campaign.brand,
          status: SUBMISSION_STATUS.SUBMITTED,
          postUrl,
          versions: [{ postUrl, note }]
        });
      }

      await submission.save({ session });
      
      // TODO Phase 8: Notify Brand

      return submission;
    });
  }

  async reviewSubmission(submissionId, brandId, action, note) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    return await withTransaction(async (session) => {
      const submission = await Submission.findById(submissionId).populate('campaign').populate('application').session(session);
      
      if (!submission || submission.brand.toString() !== brandId) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }

      if (submission.status !== SUBMISSION_STATUS.SUBMITTED) {
        const err = new Error(`Cannot review submission in ${submission.status} state`); err.status = 409; throw err;
      }

      const application = submission.application;

      submission.reviews.push({ action, note, by: brandId });

      if (action === 'approved') {
        submission.status = SUBMISSION_STATUS.APPROVED;
        submission.decidedAt = new Date();
        submission.payoutBreakdown = this._calculatePayoutBreakdown(application.feePaise);
        
        // Mark application as COMPLETED
        application.status = APPLICATION_STATUS.COMPLETED;
        application.statusHistory.push({
          from: APPLICATION_STATUS.APPROVED,
          to: APPLICATION_STATUS.COMPLETED,
          by: brandId,
          note: 'Submission approved'
        });
        await application.save({ session });

        // Update campaign wallet logic will happen in Phase 6. 
        // For now we just record the amount to paidOutPaise and release from reservedPaise
        const updatedCampaign = await Campaign.findByIdAndUpdate(
          submission.campaign._id,
          {
            $inc: { reservedPaise: -application.feePaise, paidOutPaise: application.feePaise }
          },
          { session, new: true }
        );
        if (!updatedCampaign) {
          throw new Error('Concurrency Error updating campaign balances');
        }

        // Phase 6 Wallet Transaction will go here

      } else if (action === 'revision_requested') {
        if (submission.revisionCount >= MAX_REVISIONS) {
          const err = new Error('Maximum revisions reached. You must accept or reject.'); err.status = 409; throw err;
        }
        submission.status = SUBMISSION_STATUS.REVISION_REQUESTED;
      } else if (action === 'rejected') {
        submission.status = SUBMISSION_STATUS.REJECTED;
        submission.decidedAt = new Date();
        // The slot is lost. Brand's reserved budget goes back to available.
        application.status = APPLICATION_STATUS.REJECTED;
        application.rejectedAt = new Date();
        application.statusHistory.push({
          from: APPLICATION_STATUS.APPROVED,
          to: APPLICATION_STATUS.REJECTED,
          by: brandId,
          note: 'Submission rejected'
        });
        await application.save({ session });

        const updatedCampaign = await Campaign.findByIdAndUpdate(
          submission.campaign._id,
          {
            $inc: { reservedPaise: -application.feePaise, approvedCount: -1 } // Slot frees up
          },
          { session, new: true }
        );
      }

      await submission.save({ session });
      
      // TODO Phase 8: Notify Creator

      return submission;
    });
  }

  async getSubmission(submissionId, userId) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    const submission = await Submission.findById(submissionId)
      .populate('creator', 'name')
      .populate('brand', 'name')
      .populate('application')
      .populate('campaign', 'title');
    
    if (!submission || (submission.creator._id.toString() !== userId && submission.brand._id.toString() !== userId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    return submission;
  }

  async getApplicationSubmission(applicationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    const submission = await Submission.findOne({ application: applicationId })
      .populate('creator', 'name')
      .populate('brand', 'name');
    
    if (submission && (submission.creator._id.toString() !== userId && submission.brand._id.toString() !== userId)) {
        const err = new Error('Not Found'); err.status = 404; throw err;
    }
    return submission; // can be null if not submitted yet
  }

  async getCampaignSubmissions(campaignId, brandId) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    const submissions = await Submission.find({ campaign: campaignId, brand: brandId })
      .populate('creator', 'name')
      .populate('application', 'feePaise')
      .sort({ createdAt: -1 });
    return submissions;
  }
}

module.exports = new SubmissionService();
