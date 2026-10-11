const submissionService = require('../services/submissionService');

// CREATOR
const submitDeliverable = async (req, res, next) => {
  try {
    const applicationId = req.params.id || req.params.applicationId;
    const { postUrl, note } = req.body;
    const submission = await submissionService.submitDeliverable(applicationId, req.user.id, { postUrl, note });
    res.status(201).json(submission);
  } catch (error) {
    next(error);
  }
};

const resubmitDeliverable = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { postUrl, note } = req.body;
    const submission = await submissionService.resubmitDeliverable(id, req.user.id, { postUrl, note });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

const listMySubmissions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const submissions = await submissionService.listMySubmissions(req.user.id, status);
    res.status(200).json(submissions);
  } catch (error) {
    next(error);
  }
};

// BRAND
const listCampaignSubmissions = async (req, res, next) => {
  try {
    const campaignId = req.params.id || req.params.campaignId;
    const { status } = req.query;
    const submissions = await submissionService.listCampaignSubmissions(campaignId, req.user.id, status);
    res.status(200).json(submissions);
  } catch (error) {
    next(error);
  }
};

const approveSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const submission = await submissionService.approveSubmission(id, req.user.id, { note });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

const requestRevision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const submission = await submissionService.requestRevision(id, req.user.id, { note });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

const rejectSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const submission = await submissionService.rejectSubmission(id, req.user.id, { note });
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

// BOTH
const getSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const submission = await submissionService.getSubmission(id, req.user);
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

const getApplicationSubmission = async (req, res, next) => {
  try {
    const applicationId = req.params.id || req.params.applicationId;
    const submission = await submissionService.getApplicationSubmission(applicationId, req.user.id);
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitDeliverable,
  resubmitDeliverable,
  listMySubmissions,
  listCampaignSubmissions,
  approveSubmission,
  requestRevision,
  rejectSubmission,
  getSubmission,
  getApplicationSubmission,
  // Backward compatibility aliases
  submitWork: submitDeliverable,
  reviewSubmission: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, note } = req.body;
      if (action === 'approved') {
        const sub = await submissionService.approveSubmission(id, req.user.id, { note });
        return res.json(sub);
      } else if (action === 'revision_requested') {
        const sub = await submissionService.requestRevision(id, req.user.id, { note });
        return res.json(sub);
      } else if (action === 'rejected') {
        const sub = await submissionService.rejectSubmission(id, req.user.id, { note });
        return res.json(sub);
      }
      res.status(400).json({ message: 'Invalid action' });
    } catch (error) {
      next(error);
    }
  },
  getCampaignSubmissions: listCampaignSubmissions
};
