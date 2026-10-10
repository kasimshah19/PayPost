const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');

router.get('/brand/ping', protect, requireRole('brand'), (req, res) => {
  res.json({ message: 'brand ok' });
});

router.get('/creator/ping', protect, requireRole('creator'), (req, res) => {
  res.json({ message: 'creator ok' });
});

module.exports = router;
