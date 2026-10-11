/**
 * Core notification service implementing the Transactional Outbox pattern.
 *
 * Enqueues dual-channel jobs (Email + WhatsApp) inside callers' active MongoDB transactions
 * using atomic updateOne + $setOnInsert (dedupeKey) to avoid transaction aborts.
 */

const User = require('../models/User');
const NotificationJob = require('../models/NotificationJob');
const { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } = require('../constants');
const { renderTemplate } = require('./notificationTemplates');
const { nextAllowedSendTime } = require('../utils/quietHours');
const clock = require('./clock');

/**
 * Enqueues a notification for a single recipient across both channels.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.recipientId - Target User ID
 * @param {string} params.event - NOTIFICATION_EVENTS.*
 * @param {string} params.refId - Reference ID for dedupe (e.g. applicationId, submissionId)
 * @param {string|number} [params.version] - Optional version suffix for dedupe (e.g. revisionCount)
 * @param {Object} [params.payload] - Data passed to template renderer
 * @param {mongoose.ClientSession} [params.session] - Active transaction session (Transactional Outbox)
 */
async function notify({ recipientId, event, refId, dedupeRefId, version, dedupeVersion, payload = {}, session = null }) {
  if (!recipientId) return;

  const actualRefId = refId || dedupeRefId || 'global';
  const actualVersion = version !== undefined && version !== null ? version : dedupeVersion;

  const user = await User.findById(recipientId).session(session);
  if (!user) return;

  const { title, message } = renderTemplate(event, payload);

  const now = clock.now();
  const scheduledTime = nextAllowedSendTime(now);
  const heldForQuietHours = scheduledTime.getTime() > now.getTime();

  // Channels to process: email and whatsapp
  const channels = [NOTIFICATION_CHANNEL.EMAIL, NOTIFICATION_CHANNEL.WHATSAPP];

  for (const channel of channels) {
    // Construct dedupeKey = "<event>:<refId>[:<version>]:<userId>:<channel>"
    const versionPart = actualVersion !== undefined && actualVersion !== null ? `:${actualVersion}` : '';
    const dedupeKey = `${event}:${actualRefId}${versionPart}:${user._id}:${channel}`;

    let initialStatus = NOTIFICATION_STATUS.PENDING;
    let skippedReason = null;

    // Check opt-out at enqueue time
    // Note: Opt-out applies to ALL events including payouts (per Phase 8 spec)
    const isOptedIn = user.notificationPrefs ? user.notificationPrefs[channel] !== false : true;
    if (!isOptedIn) {
      initialStatus = NOTIFICATION_STATUS.SKIPPED;
      skippedReason = 'opted_out';
    } else if (channel === NOTIFICATION_CHANNEL.WHATSAPP && (!user.phone || !user.phone.trim())) {
      initialStatus = NOTIFICATION_STATUS.SKIPPED;
      skippedReason = 'no_phone';
    }

    const jobData = {
      user: user._id,
      channel,
      event,
      title,
      message,
      payload,
      status: initialStatus,
      scheduledFor: scheduledTime,
      heldForQuietHours,
      skippedReason,
      dedupeKey,
      attempts: 0
    };

    // Use updateOne with upsert and $setOnInsert so duplicate dedupeKeys are silent no-ops
    // and NEVER abort active MongoDB transactions with E11000!
    await NotificationJob.updateOne(
      { dedupeKey },
      { $setOnInsert: jobData },
      { upsert: true, session }
    );
  }
}

/**
 * Enqueues notifications for multiple recipients (e.g., campaign cancelled fan-out).
 *
 * @param {Array<string|mongoose.Types.ObjectId>} recipientIds
 * @param {Object} params
 */
async function notifyMany(recipientIds, params) {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;
  for (const recipientId of recipientIds) {
    await notify({ ...params, recipientId });
  }
}

module.exports = {
  notify,
  notifyMany
};
