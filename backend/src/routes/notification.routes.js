/**
 * Notification API routes.
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

// Protect all notification routes
router.use(protect);

router.get('/', notificationController.getNotifications);
router.get('/status', notificationController.getStatus);

module.exports = router;
