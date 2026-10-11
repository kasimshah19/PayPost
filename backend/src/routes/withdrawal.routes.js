const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const withdrawalController = require('../controllers/withdrawal.controller');

const router = express.Router();

// All withdrawal routes are creator-only
router.use(protect, requireRole('creator'));

router.post('/', withdrawalController.requestWithdrawal);
router.get('/', withdrawalController.getWithdrawals);
router.get('/:id', withdrawalController.getWithdrawal);

module.exports = router;
