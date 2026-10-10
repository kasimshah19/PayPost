const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/application.controller');
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { z } = require('zod');

// Creator routes
router.post(
  '/campaigns/:id/apply',
  protect,
  requireRole('creator'),
  validate(z.object({ pitch: z.string().max(1000).optional() })),
  applicationController.apply
);

router.get(
  '/applications/mine',
  protect,
  requireRole('creator'),
  applicationController.getMine
);

router.post(
  '/applications/:id/withdraw',
  protect,
  requireRole('creator'),
  applicationController.withdraw
);

// Brand routes
router.get(
  '/campaigns/:id/applications',
  protect,
  requireRole('brand'),
  applicationController.getCampaignApplications
);

router.post(
  '/applications/:id/approve',
  protect,
  requireRole('brand'),
  applicationController.approve
);

router.post(
  '/applications/:id/reject',
  protect,
  requireRole('brand'),
  validate(z.object({ note: z.string().max(1000).optional() })),
  applicationController.reject
);

module.exports = router;
