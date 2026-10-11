const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const walletController = require('../controllers/wallet.controller');

const router = express.Router();

// All wallet routes are creator-only
router.get('/', protect, requireRole('creator'), walletController.getWallet);
router.get('/ledger', protect, requireRole('creator'), walletController.getLedger);

module.exports = router;
