const submissionService = require('../services/submission.service');

const submitWork = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const { postUrl, note } = req.body;
    const submission = await submissionService.submitWork(applicationId, req.user.id, postUrl, note);
    res.status(201).json(submission);
  } catch (error) {
    next(error);
  }
};

const reviewSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    const submission = await submissionService.reviewSubmission(id, req.user.id, action, note);
    res.json(submission);
  } catch (error) {
    next(error);
  }
};

const getSubmission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const submission = await submissionService.getSubmission(id, req.user.id);
    res.json(submission);
  } catch (error) {
    next(error);
  }
};

const getApplicationSubmission = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const submission = await submissionService.getApplicationSubmission(applicationId, req.user.id);
    if (!submission) {
      return res.status(200).json(null);
    }
    res.json(submission);
  } catch (error) {
    next(error);
  }
};

const getCampaignSubmissions = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const submissions = await submissionService.getCampaignSubmissions(campaignId, req.user.id);
    res.json(submissions);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitWork,
  reviewSubmission,
  getSubmission,
  getApplicationSubmission,
  getCampaignSubmissions
};
