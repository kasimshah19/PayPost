/**
 * Background worker for dispatching notification jobs.
 *
 * Responsibilities:
 * 1) Atomic claim of pending jobs whose scheduledFor <= clock.now()
 * 2) Re-check quiet hours (reschedule to next 9:00 AM IST if now is quiet)
 * 3) Re-check user preferences and phone (mark skipped if user opted out post-enqueue)
 * 4) Call mock providers OUTSIDE DB transactions
 * 5) Finalize: sent, or retry with backoff passed through nextAllowedSendTime, or failed after max attempts
 * 6) Reconcile stuck processing jobs older than timeout
 */

const NotificationJob = require('../models/NotificationJob');
const User = require('../models/User');
const { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } = require('../constants');
const { isQuietHours, nextAllowedSendTime } = require('../utils/quietHours');
const clock = require('../services/clock');
const mockEmailProvider = require('../services/mockEmailProvider');
const mockWhatsappProvider = require('../services/mockWhatsappProvider');
const env = require('../config/env');

let isProcessing = false;

/**
 * Runs one cycle of notification processing.
 *
 * @returns {Promise<{ claimed: number, sent: number, skipped: number, failed: number, rescheduled: number }>}
 */
async function processNotificationsOnce() {
  const stats = { claimed: 0, sent: 0, skipped: 0, failed: 0, rescheduled: 0, reconciled: 0 };
  const maxAttempts = env.NOTIFICATION_MAX_ATTEMPTS || 3;
  const batchLimit = 50; // Process at most 50 jobs per run to release in batches

  // 1) CLAIM + PROCESS LOOP
  while (stats.claimed < batchLimit) {
    const now = clock.now();

    // Atomically claim the oldest pending job whose scheduledFor <= now
    // Sorted by scheduledFor asc, then createdAt asc
    const claimed = await NotificationJob.findOneAndUpdate(
      {
        status: NOTIFICATION_STATUS.PENDING,
        scheduledFor: { $lte: now }
      },
      {
        status: NOTIFICATION_STATUS.PROCESSING,
        processingStartedAt: now,
        $inc: { attempts: 1 }
      },
      {
        sort: { scheduledFor: 1, createdAt: 1 },
        new: true
      }
    );

    if (!claimed) {
      break; // No more pending jobs eligible to send right now
    }

    stats.claimed++;

    try {
      // CHECK (a): Re-check quiet hours right now at send time!
      if (isQuietHours(now)) {
        const nextSend = nextAllowedSendTime(now);
        await NotificationJob.findByIdAndUpdate(claimed._id, {
          status: NOTIFICATION_STATUS.PENDING,
          scheduledFor: nextSend,
          heldForQuietHours: true,
          $inc: { attempts: -1 }, // Undo the attempt increment when rescheduling for quiet hours
          $unset: { processingStartedAt: 1 }
        });
        stats.rescheduled++;
        continue;
      }

      // CHECK (b): Re-load user and re-check opt-out and phone
      // Note: Opting back in later does NOT resurrect skipped jobs; skipped status is permanent.
      const user = await User.findById(claimed.user);
      if (!user) {
        await NotificationJob.findByIdAndUpdate(claimed._id, {
          status: NOTIFICATION_STATUS.SKIPPED,
          skippedReason: 'user_deleted',
          $unset: { processingStartedAt: 1 }
        });
        stats.skipped++;
        continue;
      }

      const isOptedIn = user.notificationPrefs ? user.notificationPrefs[claimed.channel] !== false : true;
      if (!isOptedIn) {
        await NotificationJob.findByIdAndUpdate(claimed._id, {
          status: NOTIFICATION_STATUS.SKIPPED,
          skippedReason: 'opted_out',
          $unset: { processingStartedAt: 1 }
        });
        stats.skipped++;
        continue;
      }

      if (claimed.channel === NOTIFICATION_CHANNEL.WHATSAPP && (!user.phone || !user.phone.trim())) {
        await NotificationJob.findByIdAndUpdate(claimed._id, {
          status: NOTIFICATION_STATUS.SKIPPED,
          skippedReason: 'no_phone',
          $unset: { processingStartedAt: 1 }
        });
        stats.skipped++;
        continue;
      }

      // Call the provider OUTSIDE any database transaction
      let sendResult;
      const idempotencyKey = String(claimed._id);

      if (claimed.channel === NOTIFICATION_CHANNEL.EMAIL) {
        sendResult = await mockEmailProvider.send({
          idempotencyKey,
          to: user.email,
          subject: claimed.title,
          body: claimed.message
        });
      } else {
        sendResult = await mockWhatsappProvider.send({
          idempotencyKey,
          to: user.phone,
          body: claimed.message
        });
      }

      // 3) FINALIZE conditional update on { _id, status: "processing" }
      if (sendResult.status === 'success') {
        const updated = await NotificationJob.findOneAndUpdate(
          { _id: claimed._id, status: NOTIFICATION_STATUS.PROCESSING },
          {
            status: NOTIFICATION_STATUS.SENT,
            sentAt: clock.now(),
            providerRef: sendResult.providerRef,
            $unset: { processingStartedAt: 1, lastError: 1 }
          },
          { new: true }
        );
        if (updated) stats.sent++;
      } else {
        // Provider failure
        const currentAttempts = claimed.attempts; // already incremented by 1 during claim
        if (currentAttempts < maxAttempts) {
          // Backoff: 1 minute after 1st failure (attempt=1), 5 minutes after 2nd (attempt=2)
          const backoffMinutes = currentAttempts === 1 ? 1 : 5;
          const nextAttemptTarget = new Date(now.getTime() + backoffMinutes * 60 * 1000);
          // Pass retry target through nextAllowedSendTime so retries never go out during quiet hours!
          const nextSend = nextAllowedSendTime(nextAttemptTarget);
          const wasHeld = nextSend.getTime() > nextAttemptTarget.getTime();

          const updated = await NotificationJob.findOneAndUpdate(
            { _id: claimed._id, status: NOTIFICATION_STATUS.PROCESSING },
            {
              status: NOTIFICATION_STATUS.PENDING,
              scheduledFor: nextSend,
              heldForQuietHours: wasHeld,
              lastError: sendResult.failureReason || 'Provider failed',
              $unset: { processingStartedAt: 1 }
            },
            { new: true }
          );
          if (updated) stats.rescheduled++;
        } else {
          // Exhausted max attempts
          const updated = await NotificationJob.findOneAndUpdate(
            { _id: claimed._id, status: NOTIFICATION_STATUS.PROCESSING },
            {
              status: NOTIFICATION_STATUS.FAILED,
              lastError: sendResult.failureReason || 'Failed after maximum attempts',
              $unset: { processingStartedAt: 1 }
            },
            { new: true }
          );
          if (updated) stats.failed++;
        }
      }
    } catch (err) {
      console.error(`[NotificationWorker] Unexpected error on job ${claimed._id}:`, err);
    }
  }

  // 2) RECONCILE STUCK PROCESSING JOBS
  const stuckCutoff = new Date(clock.now().getTime() - (env.NOTIFICATION_STUCK_AFTER_MS || 60000));
  const stuckJobs = await NotificationJob.find({
    status: NOTIFICATION_STATUS.PROCESSING,
    processingStartedAt: { $lt: stuckCutoff }
  });

  for (const stuck of stuckJobs) {
    try {
      await NotificationJob.findByIdAndUpdate(stuck._id, {
        status: NOTIFICATION_STATUS.PENDING,
        $unset: { processingStartedAt: 1 }
      });
      stats.reconciled++;
    } catch (err) {
      console.error(`[NotificationWorker] Error reconciling stuck job ${stuck._id}:`, err);
    }
  }

  return stats;
}

/**
 * Starts background worker recurring interval.
 */
function startNotificationWorker() {
  if (env.NOTIFICATION_WORKER_ENABLED === false) {
    return null;
  }

  console.log(`[NotificationWorker] Background notification worker started (polling interval: ${env.NOTIFICATION_WORKER_INTERVAL_MS || 5000}ms)`);

  const intervalId = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await processNotificationsOnce();
    } catch (err) {
      console.error('[NotificationWorker] Execution loop error:', err);
    } finally {
      isProcessing = false;
    }
  }, env.NOTIFICATION_WORKER_INTERVAL_MS || 5000);

  return intervalId;
}

module.exports = {
  processNotificationsOnce,
  startNotificationWorker
};
