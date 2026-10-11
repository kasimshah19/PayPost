const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaign.controller');
const { protect, requireRole } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { createCampaignSchema, updateCampaignSchema, cancelCampaignSchema, browseCampaignsQuerySchema } = require('../schemas/campaign.schemas');

router.use(protect);

// BRAND ROUTES
router.post('/', requireRole('brand'), validate(createCampaignSchema), campaignController.createCampaign);
router.get('/mine', requireRole('brand'), campaignController.getMine);
router.get('/mine/summary', requireRole('brand'), campaignController.getMineSummary);
router.get('/mine/attention', requireRole('brand'), campaignController.getMineAttention);
router.patch('/:id', requireRole('brand'), validate(updateCampaignSchema), campaignController.updateCampaign);
router.post('/:id/cancel', requireRole('brand'), validate(cancelCampaignSchema), campaignController.cancelCampaign);

// CREATOR ROUTES
router.get('/', requireRole('creator'), validateQuery(browseCampaignsQuerySchema), campaignController.browseCampaigns);

// SHARED ROUTES
router.get('/:id', campaignController.getById);

module.exports = router;
