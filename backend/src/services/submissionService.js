const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Application = require('../models/Application');
const Campaign = require('../models/Campaign');
const { SUBMISSION_STATUS, APPLICATION_STATUS, CAMPAIGN_STATUS, MAX_REVISIONS } = require('../constants');
const withTransaction = require('../utils/withTransaction');
const { validateInstagramUrl } = require('../utils/instagram');
const payoutService = require('./payoutService');

class SubmissionService {
  /**
   * Submit deliverable by creator for an approved application.
   */
  async submitDeliverable(applicationId, creatorId, { postUrl, note }) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const application = await Application.findById(applicationId).populate('campaign');
    if (!application || application.creator.toString() !== creatorId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (application.status !== APPLICATION_STATUS.APPROVED) {
      const err = new Error('You can only submit work for approved applications');
      err.status = 409;
      throw err;
    }

    if (application.submission) {
      const err = new Error('You already submitted');
      err.status = 409;
      throw err;
    }

    const campaign = application.campaign;
    if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) {
      const err = new Error('Campaign is not active');
      err.status = 409;
      throw err;
    }

    if (new Date() > new Date(campaign.submissionDeadline)) {
      const err = new Error('Submission deadline has passed');
      err.status = 409;
      throw err;
    }

    // Validate Instagram URL
    const validation = validateInstagramUrl(postUrl);
    if (!validation.isValid) {
      const err = new Error(validation.error);
      err.status = 400;
      throw err;
    }

    const { postUrl: normalizedUrl, postUrlKey } = validation;

    // Duplicate protection in the same campaign
    const duplicate = await Submission.findOne({ campaign: campaign._id, postUrlKey });
    if (duplicate) {
      const err = new Error('This post was already submitted by another creator');
      err.status = 409;
      throw err;
    }

    const newSubmissionId = new mongoose.Types.ObjectId();

    return await withTransaction(async (session) => {
      // Step 1: Conditional update on the Application
      const updatedApp = await Application.findOneAndUpdate(
        {
          _id: applicationId,
          creator: creatorId,
          status: APPLICATION_STATUS.APPROVED,
          submission: null
        },
        {
          $set: { submission: newSubmissionId }
        },
        { session, new: true }
      );

      if (!updatedApp) {
        const err = new Error('You already submitted or application is not approved');
        err.status = 409;
        throw err;
      }

      // Step 2: Create Submission
      const submission = new Submission({
        _id: newSubmissionId,
        application: applicationId,
        campaign: campaign._id,
        creator: creatorId,
        brand: campaign.brand,
        status: SUBMISSION_STATUS.SUBMITTED,
        postUrl: normalizedUrl,
        postUrlKey,
        revisionCount: 0,
        versions: [{
          postUrl: normalizedUrl,
          note: note || '',
          submittedAt: new Date()
        }],
        reviews: []
      });

      try {
        await submission.save({ session });
      } catch (err) {
        if (err.code === 11000) {
          const dupErr = new Error('This post was already submitted by another creator');
          dupErr.status = 409;
          throw dupErr;
        }
        throw err;
      }

      // TODO Phase 8: notify brand of submission

      return submission;
    });
  }

  /**
   * Resubmit deliverable by creator after revision requested.
   */
  async resubmitDeliverable(submissionId, creatorId, { postUrl, note }) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const submission = await Submission.findById(submissionId);
    if (!submission || submission.creator.toString() !== creatorId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (submission.status === SUBMISSION_STATUS.APPROVED || submission.status === SUBMISSION_STATUS.REJECTED) {
      const err = new Error('Cannot resubmit an approved or rejected submission');
      err.status = 409;
      throw err;
    }

    if (submission.status !== SUBMISSION_STATUS.REVISION_REQUESTED) {
      const err = new Error(`Cannot resubmit while submission is in ${submission.status} status`);
      err.status = 409;
      throw err;
    }

    if (submission.revisionDueAt && new Date() > new Date(submission.revisionDueAt)) {
      const err = new Error('Revision deadline has passed');
      err.status = 409;
      throw err;
    }

    // Validate Instagram URL
    const validation = validateInstagramUrl(postUrl);
    if (!validation.isValid) {
      const err = new Error(validation.error);
      err.status = 400;
      throw err;
    }

    const { postUrl: normalizedUrl, postUrlKey } = validation;

    // Check duplicate key for other creators in the same campaign
    const duplicate = await Submission.findOne({
      campaign: submission.campaign,
      postUrlKey,
      _id: { $ne: submission._id }
    });
    if (duplicate) {
      const err = new Error('This post was already submitted by another creator');
      err.status = 409;
      throw err;
    }

    return await withTransaction(async (session) => {
      // Atomic conditional update on { _id, creator, status: "revision_requested" }
      const updatedSubmission = await Submission.findOneAndUpdate(
        {
          _id: submissionId,
          creator: creatorId,
          status: SUBMISSION_STATUS.REVISION_REQUESTED
        },
        {
          $set: {
            status: SUBMISSION_STATUS.SUBMITTED,
            postUrl: normalizedUrl,
            postUrlKey
          },
          $push: {
            versions: {
              postUrl: normalizedUrl,
              note: note || '',
              submittedAt: new Date()
            }
          }
        },
        { session, new: true }
      );

      if (!updatedSubmission) {
        const err = new Error('Submission is no longer in revision_requested status');
        err.status = 409;
        throw err;
      }

      // TODO Phase 8: notify brand of resubmission

      return updatedSubmission;
    });
  }

  /**
   * Brand approves deliverable.
   */
  async approveSubmission(submissionId, brandId, { note } = {}) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const submission = await Submission.findById(submissionId).populate('campaign').populate('application');
    if (!submission || submission.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (submission.status !== SUBMISSION_STATUS.SUBMITTED) {
      const err = new Error(`Only submissions with status submitted can be approved (currently ${submission.status})`);
      err.status = 409;
      throw err;
    }

    return await withTransaction(async (session) => {
      // Atomic conditional update on { _id, brand, status: "submitted" }
      const updatedSubmission = await Submission.findOneAndUpdate(
        {
          _id: submissionId,
          brand: brandId,
          status: SUBMISSION_STATUS.SUBMITTED
        },
        {
          $set: {
            status: SUBMISSION_STATUS.APPROVED,
            decidedAt: new Date()
          },
          $push: {
            reviews: {
              action: 'approved',
              note: note || '',
              at: new Date(),
              by: brandId
            }
          }
        },
        { session, new: true }
      );

      if (!updatedSubmission) {
        const err = new Error('Submission was already reviewed');
        err.status = 409;
        throw err;
      }

      // Transition application: approved -> completed
      const application = await Application.findById(submission.application._id || submission.application).session(session);
      application.status = APPLICATION_STATUS.COMPLETED;
      application.statusHistory.push({
        from: APPLICATION_STATUS.APPROVED,
        to: APPLICATION_STATUS.COMPLETED,
        by: brandId,
        at: new Date(),
        note: note || 'Submission approved'
      });
      await application.save({ session });

      // Call payout stub to shift reserved funds to paidOutPaise
      await payoutService.settleApprovedSubmission(session, {
        campaign: submission.campaign,
        application,
        submission: updatedSubmission
      });

      // TODO Phase 8: notify creator of approval

      return updatedSubmission;
    });
  }

  /**
   * Brand requests revision (max 2 revisions).
   */
  async requestRevision(submissionId, brandId, { note }) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (!note || typeof note !== 'string' || note.trim().length < 5) {
      const err = new Error('Note is required and must be at least 5 characters');
      err.status = 400;
      throw err;
    }

    const submission = await Submission.findById(submissionId);
    if (!submission || submission.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (submission.status !== SUBMISSION_STATUS.SUBMITTED) {
      const err = new Error(`Only submissions with status submitted can be reviewed (currently ${submission.status})`);
      err.status = 409;
      throw err;
    }

    if (submission.revisionCount >= MAX_REVISIONS) {
      const err = new Error('Maximum 2 revisions already used. You can only approve or reject now.');
      err.status = 409;
      throw err;
    }

    return await withTransaction(async (session) => {
      const campaign = await Campaign.findById(submission.campaign).session(session);
      const nowPlus48h = Date.now() + 48 * 60 * 60 * 1000;
      const campaignDeadline = new Date(campaign.submissionDeadline).getTime();
      const revisionDueAt = new Date(Math.max(campaignDeadline, nowPlus48h));

      const updatedSubmission = await Submission.findOneAndUpdate(
        {
          _id: submissionId,
          brand: brandId,
          status: SUBMISSION_STATUS.SUBMITTED,
          revisionCount: { $lt: MAX_REVISIONS }
        },
        {
          $set: {
            status: SUBMISSION_STATUS.REVISION_REQUESTED,
            revisionDueAt
          },
          $inc: { revisionCount: 1 },
          $push: {
            reviews: {
              action: 'revision_requested',
              note: note.trim(),
              at: new Date(),
              by: brandId
            }
          }
        },
        { session, new: true }
      );

      if (!updatedSubmission) {
        const current = await Submission.findById(submissionId).session(session);
        if (current && current.revisionCount >= MAX_REVISIONS) {
          const err = new Error('Maximum 2 revisions already used. You can only approve or reject now.');
          err.status = 409;
          throw err;
        }
        const err = new Error('Submission was already reviewed');
        err.status = 409;
        throw err;
      }

      // TODO Phase 8: notify creator of revision request

      return updatedSubmission;
    });
  }

  /**
   * Brand rejects submission.
   */
  async rejectSubmission(submissionId, brandId, { note }) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (!note || typeof note !== 'string' || note.trim().length < 5) {
      const err = new Error('Note is required and must be at least 5 characters');
      err.status = 400;
      throw err;
    }

    const submission = await Submission.findById(submissionId).populate('application');
    if (!submission || submission.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    if (submission.status !== SUBMISSION_STATUS.SUBMITTED) {
      const err = new Error(`Only submissions with status submitted can be rejected (currently ${submission.status})`);
      err.status = 409;
      throw err;
    }

    return await withTransaction(async (session) => {
      // Atomic conditional update on Submission
      const updatedSubmission = await Submission.findOneAndUpdate(
        {
          _id: submissionId,
          brand: brandId,
          status: SUBMISSION_STATUS.SUBMITTED
        },
        {
          $set: {
            status: SUBMISSION_STATUS.REJECTED,
            decidedAt: new Date()
          },
          $push: {
            reviews: {
              action: 'rejected',
              note: note.trim(),
              at: new Date(),
              by: brandId
            }
          }
        },
        { session, new: true }
      );

      if (!updatedSubmission) {
        const err = new Error('Submission was already reviewed');
        err.status = 409;
        throw err;
      }

      // Transition Application approved -> rejected
      const application = await Application.findById(submission.application._id || submission.application).session(session);
      application.status = APPLICATION_STATUS.REJECTED;
      application.rejectedAt = new Date();
      application.statusHistory.push({
        from: APPLICATION_STATUS.APPROVED,
        to: APPLICATION_STATUS.REJECTED,
        by: brandId,
        at: new Date(),
        note: note.trim()
      });
      await application.save({ session });

      // Release reservedPaise and slot on Campaign
      const updatedCampaign = await Campaign.findOneAndUpdate(
        {
          _id: submission.campaign._id || submission.campaign,
          reservedPaise: { $gte: application.feePaise },
          approvedCount: { $gte: 1 }
        },
        {
          $inc: {
            reservedPaise: -application.feePaise,
            approvedCount: -1
          }
        },
        { session, new: true }
      );

      if (!updatedCampaign) {
        const err = new Error('Failed to release campaign reservation. Concurrency mismatch.');
        err.status = 409;
        throw err;
      }

      // TODO Phase 8: notify creator of rejection

      return updatedSubmission;
    });
  }

  /**
   * List submissions for a campaign (Brand only, must own campaign).
   */
  async listCampaignSubmissions(campaignId, brandId, statusFilter) {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.brand.toString() !== brandId) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const query = { campaign: campaignId };
    if (statusFilter) query.status = statusFilter;

    const submissions = await Submission.find(query)
      .populate('creator', 'name')
      .populate('application', 'feePaise')
      .sort({ createdAt: -1 })
      .lean();

    return submissions.map(sub => ({
      _id: sub._id,
      id: sub._id,
      creator: {
        _id: sub.creator._id,
        id: sub.creator._id,
        name: sub.creator.name
      },
      postUrl: sub.postUrl,
      status: sub.status,
      revisionCount: sub.revisionCount,
      revisionsLeft: Math.max(0, MAX_REVISIONS - sub.revisionCount),
      revisionDueAt: sub.revisionDueAt,
      versions: sub.versions,
      reviews: sub.reviews,
      feePaise: sub.application ? sub.application.feePaise : 0,
      createdAt: sub.createdAt
    }));
  }

  /**
   * List my submissions (Creator).
   */
  async listMySubmissions(creatorId, statusFilter) {
    const query = { creator: creatorId };
    if (statusFilter) query.status = statusFilter;

    const submissions = await Submission.find(query)
      .populate('campaign', 'title submissionDeadline')
      .populate('application', 'feePaise')
      .sort({ createdAt: -1 })
      .lean();

    return submissions.map(sub => {
      const latestReview = sub.reviews && sub.reviews.length > 0 ? sub.reviews[sub.reviews.length - 1] : null;
      return {
        _id: sub._id,
        id: sub._id,
        campaign: {
          _id: sub.campaign ? sub.campaign._id : null,
          id: sub.campaign ? sub.campaign._id : null,
          title: sub.campaign ? sub.campaign.title : 'Campaign',
          submissionDeadline: sub.campaign ? sub.campaign.submissionDeadline : null
        },
        status: sub.status,
        postUrl: sub.postUrl,
        revisionCount: sub.revisionCount,
        revisionsLeft: Math.max(0, MAX_REVISIONS - sub.revisionCount),
        revisionDueAt: sub.revisionDueAt,
        latestReviewNote: latestReview ? latestReview.note : null,
        feePaise: sub.application ? sub.application.feePaise : 0,
        createdAt: sub.createdAt
      };
    });
  }

  /**
   * Get single submission detail (Creator or Brand).
   */
  async getSubmission(submissionId, user) {
    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const submission = await Submission.findById(submissionId)
      .populate('creator', 'name')
      .populate('brand', 'name')
      .populate('application', 'feePaise status')
      .populate('campaign', 'title submissionDeadline')
      .lean();

    if (!submission) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }

    const isCreator = submission.creator._id.toString() === user.id;
    const isBrand = submission.brand._id.toString() === user.id;

    if (user.role === 'creator') {
      if (!isCreator) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }
    } else if (user.role === 'brand') {
      if (!isBrand) {
        const err = new Error('Not Found'); err.status = 404; throw err;
      }
    } else {
      const err = new Error('Not authorized for this role'); err.status = 403; throw err;
    }

    return {
      ...submission,
      id: submission._id,
      revisionsLeft: Math.max(0, MAX_REVISIONS - submission.revisionCount),
      feePaise: submission.application ? submission.application.feePaise : 0
    };
  }

  // Backward compatibility alias for any existing code
  async submitWork(applicationId, creatorId, postUrl, note) {
    return this.submitDeliverable(applicationId, creatorId, { postUrl, note });
  }

  async getApplicationSubmission(applicationId, userId) {
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    const submission = await Submission.findOne({ application: applicationId })
      .populate('creator', 'name')
      .populate('brand', 'name')
      .lean();

    if (submission && (submission.creator._id.toString() !== userId && submission.brand._id.toString() !== userId)) {
      const err = new Error('Not Found'); err.status = 404; throw err;
    }
    return submission;
  }
}

module.exports = new SubmissionService();
