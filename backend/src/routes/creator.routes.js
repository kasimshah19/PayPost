const express = require('express');
const router = express.Router();
const creatorService = require('../services/creator.service');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect);
router.use(requireRole('creator'));

router.get('/next-actions', async (req, res, next) => {
  try {
    const nextActions = await creatorService.getNextActions(req.user.id);
    res.json(nextActions);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
