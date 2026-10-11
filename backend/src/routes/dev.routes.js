/**
 * Developer clock and testing helper routes.
 *
 * CRITICAL RULE: These routes must NEVER be mounted unless ENABLE_DEV_TOOLS === true
 * AND NODE_ENV !== 'production'. Otherwise they are completely absent from the router and return 404.
 *
 * NOTE: Dev tools exist only so quiet hours can be tested without waiting for night.
 */

const express = require('express');
const router = express.Router();
const clock = require('../services/clock');
const { isQuietHours, nextAllowedSendTime, formatIstDate } = require('../utils/quietHours');
const { processNotificationsOnce } = require('../jobs/notificationWorker');
const { protect } = require('../middleware/auth');

// Protect all dev routes: only authenticated users
router.use(protect);

/**
 * GET /api/dev/clock
 */
router.get('/clock', (req, res) => {
  const simNow = clock.now();
  // Format IST representation
  const istMs = simNow.getTime() + 330 * 60 * 1000;
  const istDate = new Date(istMs);

  res.status(200).json({
    enabled: true,
    simulatedNow: simNow.toISOString(),
    simulatedNowIst: istDate.toISOString().replace('Z', '+05:30'),
    offsetMs: clock.getOffsetMs(),
    quietHoursActive: isQuietHours(simNow)
  });
});

/**
 * POST /api/dev/clock
 * Body: { action: "realtime" | "tonight_10pm" | "next_9am" }
 */
router.post('/clock', (req, res) => {
  const { action } = req.body;

  if (action === 'realtime') {
    clock.resetClock();
  } else if (action === 'tonight_10pm') {
    // Sets simulated time to 22:00:00.000 IST of the CURRENT REAL IST date
    const realNow = new Date();
    const realIstMs = realNow.getTime() + 330 * 60 * 1000;
    const realIst = new Date(realIstMs);

    const year = realIst.getUTCFullYear();
    const month = realIst.getUTCMonth();
    const date = realIst.getUTCDate();

    // 22:00:00.000 IST in UTC ms
    const targetUtcMs = Date.UTC(year, month, date, 22, 0, 0, 0) - (330 * 60 * 1000);
    const newOffsetMs = targetUtcMs - Date.now();
    clock.setOffsetMs(newOffsetMs);
  } else if (action === 'next_9am') {
    // Sets simulated time to 09:00:05.000 IST of the next morning after CURRENT SIMULATED time
    const currentSim = clock.now();
    const simIstMs = currentSim.getTime() + 330 * 60 * 1000;
    const simIst = new Date(simIstMs);

    let year = simIst.getUTCFullYear();
    let month = simIst.getUTCMonth();
    let date = simIst.getUTCDate();

    const simHour = simIst.getUTCHours();
    if (simHour >= 9) {
      // Advance to tomorrow's 9:00 AM IST
      date += 1;
    }

    // 09:00:05.000 IST in UTC ms (plus 5 seconds buffer)
    const targetUtcMs = Date.UTC(year, month, date, 9, 0, 5, 0) - (330 * 60 * 1000);
    const newOffsetMs = targetUtcMs - Date.now();
    clock.setOffsetMs(newOffsetMs);
  } else {
    return res.status(400).json({ message: 'Invalid action. Must be realtime, tonight_10pm, or next_9am' });
  }

  const updatedNow = clock.now();
  const istMs = updatedNow.getTime() + 330 * 60 * 1000;
  const istDate = new Date(istMs);

  res.status(200).json({
    enabled: true,
    action,
    simulatedNow: updatedNow.toISOString(),
    simulatedNowIst: istDate.toISOString().replace('Z', '+05:30'),
    offsetMs: clock.getOffsetMs(),
    quietHoursActive: isQuietHours(updatedNow)
  });
});

/**
 * POST /api/dev/notifications/run-worker
 * Runs processNotificationsOnce() and returns result counts
 */
router.post('/notifications/run-worker', async (req, res, next) => {
  try {
    const stats = await processNotificationsOnce();
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
