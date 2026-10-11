const express = require('express');
const { protect } = require('../middleware/auth');
const walletController = require('../controllers/wallet.controller');

const router = express.Router();

// Preview fee breakdown for any authenticated user
router.get('/preview', protect, walletController.previewFee);

module.exports = router;
