const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { submitWorkSchema, reviewSubmissionSchema } = require('../schemas/submission.schemas');
const submissionController = require('../controllers/submission.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.use(protect);

// GET /api/submissions/:id
router.get('/:id', submissionController.getSubmission);

// GET /api/submissions/campaign/:campaignId
router.get('/campaign/:campaignId', restrictTo(ROLES.BRAND), submissionController.getCampaignSubmissions);

// POST /api/submissions/:id/review
router.post(
  '/:id/review',
  restrictTo(ROLES.BRAND),
  validate(reviewSubmissionSchema),
  submissionController.reviewSubmission
);

// GET /api/applications/:applicationId/submission
router.get(
  '/application/:applicationId',
  submissionController.getApplicationSubmission
);

// POST /api/applications/:applicationId/submission
router.post(
  '/application/:applicationId',
  restrictTo(ROLES.CREATOR),
  validate(submitWorkSchema),
  submissionController.submitWork
);

module.exports = router;
