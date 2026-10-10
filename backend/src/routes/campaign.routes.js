const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaign.controller');
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createCampaignSchema, updateCampaignSchema, cancelCampaignSchema } = require('../schemas/campaign.schemas');

router.use(protect);

// BRAND ROUTES
router.post('/', requireRole('brand'), validate(createCampaignSchema), campaignController.createCampaign);
router.get('/mine', requireRole('brand'), campaignController.getMine);
router.get('/mine/summary', requireRole('brand'), campaignController.getMineSummary);
router.patch('/:id', requireRole('brand'), validate(updateCampaignSchema), campaignController.updateCampaign);
router.post('/:id/cancel', requireRole('brand'), validate(cancelCampaignSchema), campaignController.cancelCampaign);

// CREATOR ROUTES
router.get('/', requireRole('creator'), campaignController.browseCampaigns);

// SHARED ROUTES
router.get('/:id', campaignController.getById);

module.exports = router;
