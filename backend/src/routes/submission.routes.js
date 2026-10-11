const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  submitDeliverableSchema,
  resubmitDeliverableSchema,
  approveSubmissionSchema,
  requestRevisionSchema,
  rejectSubmissionSchema
} = require('../schemas/submission.schemas');
const submissionController = require('../controllers/submission.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.use(protect);

// ========================
// CREATOR ROUTES
// ========================

// POST /api/applications/:id/submission
router.post(
  '/applications/:id/submission',
  requireRole(ROLES.CREATOR),
  validate(submitDeliverableSchema),
  submissionController.submitDeliverable
);

// Backward compatibility: POST /api/applications/:applicationId/submission
router.post(
  '/application/:applicationId',
  requireRole(ROLES.CREATOR),
  validate(submitDeliverableSchema),
  submissionController.submitDeliverable
);

// PUT /api/submissions/:id/resubmit
router.put(
  '/submissions/:id/resubmit',
  requireRole(ROLES.CREATOR),
  validate(resubmitDeliverableSchema),
  submissionController.resubmitDeliverable
);

// When mounted directly under /api/submissions: PUT /:id/resubmit
router.put(
  '/:id/resubmit',
  requireRole(ROLES.CREATOR),
  validate(resubmitDeliverableSchema),
  submissionController.resubmitDeliverable
);

// GET /api/submissions/mine
router.get(
  '/submissions/mine',
  requireRole(ROLES.CREATOR),
  submissionController.listMySubmissions
);

// When mounted directly under /api/submissions: GET /mine
router.get(
  '/mine',
  requireRole(ROLES.CREATOR),
  submissionController.listMySubmissions
);

// ========================
// BRAND ROUTES
// ========================

// GET /api/campaigns/:id/submissions
router.get(
  '/campaigns/:id/submissions',
  requireRole(ROLES.BRAND),
  submissionController.listCampaignSubmissions
);

// When mounted directly under /api/submissions: GET /campaign/:campaignId
router.get(
  '/campaign/:campaignId',
  requireRole(ROLES.BRAND),
  submissionController.listCampaignSubmissions
);

// POST /api/submissions/:id/approve
router.post(
  '/submissions/:id/approve',
  requireRole(ROLES.BRAND),
  validate(approveSubmissionSchema),
  submissionController.approveSubmission
);

// When mounted directly under /api/submissions: POST /:id/approve
router.post(
  '/:id/approve',
  requireRole(ROLES.BRAND),
  validate(approveSubmissionSchema),
  submissionController.approveSubmission
);

// POST /api/submissions/:id/request-revision
router.post(
  '/submissions/:id/request-revision',
  requireRole(ROLES.BRAND),
  validate(requestRevisionSchema),
  submissionController.requestRevision
);

// When mounted directly under /api/submissions: POST /:id/request-revision
router.post(
  '/:id/request-revision',
  requireRole(ROLES.BRAND),
  validate(requestRevisionSchema),
  submissionController.requestRevision
);

// POST /api/submissions/:id/reject
router.post(
  '/submissions/:id/reject',
  requireRole(ROLES.BRAND),
  validate(rejectSubmissionSchema),
  submissionController.rejectSubmission
);

// When mounted directly under /api/submissions: POST /:id/reject
router.post(
  '/:id/reject',
  requireRole(ROLES.BRAND),
  validate(rejectSubmissionSchema),
  submissionController.rejectSubmission
);

// Backward compatibility: POST /:id/review
router.post(
  '/:id/review',
  requireRole(ROLES.BRAND),
  submissionController.reviewSubmission
);

// ========================
// BOTH / COMMON ROUTES
// ========================

// GET /api/applications/:id/submission
router.get(
  '/applications/:id/submission',
  submissionController.getApplicationSubmission
);

router.get(
  '/application/:applicationId',
  submissionController.getApplicationSubmission
);

// GET /api/submissions/:id
router.get(
  '/submissions/:id',
  submissionController.getSubmission
);

// When mounted directly under /api/submissions: GET /:id
router.get(
  '/:id',
  submissionController.getSubmission
);

module.exports = router;
