const express = require('express');
const router = express.Router();
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const authController = require('../controllers/auth.controller');

router.post('/signup', validate(authController.signupSchema), authController.signup);
router.post('/login', validate(authController.loginSchema), authController.login);
router.get('/me', protect, authController.getMe);
router.patch('/preferences', protect, validate(authController.prefsSchema), authController.updatePreferences);

module.exports = router;
