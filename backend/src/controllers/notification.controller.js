/**
 * Controller for notification endpoints.
 */

const { z } = require('zod');
const NotificationJob = require('../models/NotificationJob');
const User = require('../models/User');
const { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } = require('../constants');
const { isQuietHours, nextAllowedSendTime } = require('../utils/quietHours');
const clock = require('../services/clock');
const env = require('../config/env');

/**
 * Returns human-readable label for a notification job status
 */
function getStatusLabel(job) {
  if (job.status === NOTIFICATION_STATUS.SENT) {
    return 'Sent';
  }
  if (job.status === NOTIFICATION_STATUS.PENDING) {
    if (job.heldForQuietHours) {
      return 'Held until 9:00 AM IST';
    }
    return 'Waiting to send';
  }
  if (job.status === NOTIFICATION_STATUS.PROCESSING) {
    return 'Sending...';
  }
  if (job.status === NOTIFICATION_STATUS.SKIPPED) {
    if (job.skippedReason === 'opted_out') {
      return job.channel === NOTIFICATION_CHANNEL.WHATSAPP
        ? 'Skipped: you turned off WhatsApp'
        : 'Skipped: you turned off Email';
    }
    if (job.skippedReason === 'no_phone') {
      return 'Skipped: no phone number';
    }
    return `Skipped (${job.skippedReason || 'user preference'})`;
  }
  if (job.status === NOTIFICATION_STATUS.FAILED) {
    return `Failed after ${job.attempts || 3} attempts`;
  }
  return job.status;
}

const listQuerySchema = z.object({
  status: z.enum(Object.values(NOTIFICATION_STATUS)).optional(),
  channel: z.enum(Object.values(NOTIFICATION_CHANNEL)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * GET /api/notifications
 * Newest first, paginated, for the authenticated user only.
 */
async function getNotifications(req, res, next) {
  try {
    const query = listQuerySchema.parse(req.query);
    const filter = { user: req.user._id };

    if (query.status) {
      filter.status = query.status;
    }
    if (query.channel) {
      filter.channel = query.channel;
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      NotificationJob.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      NotificationJob.countDocuments(filter)
    ]);

    const formatted = items.map((job) => ({
      id: job._id,
      channel: job.channel,
      event: job.event,
      title: job.title,
      message: job.message,
      status: job.status,
      statusLabel: getStatusLabel(job),
      scheduledFor: job.scheduledFor,
      heldForQuietHours: job.heldForQuietHours,
      sentAt: job.sentAt,
      attempts: job.attempts,
      skippedReason: job.skippedReason,
      lastError: job.lastError,
      createdAt: job.createdAt
    }));

    res.status(200).json({
      notifications: formatted,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/status
 * Returns system time/quiet hours info and user's held count and preferences.
 */
async function getStatus(req, res, next) {
  try {
    const user = await User.findById(req.user._id).lean();
    const now = clock.now();
    const istMs = now.getTime() + 330 * 60 * 1000;
    const istDate = new Date(istMs);

    const quietActive = isQuietHours(now);
    const nextSendAt = nextAllowedSendTime(now);

    const heldCount = await NotificationJob.countDocuments({
      user: req.user._id,
      status: NOTIFICATION_STATUS.PENDING,
      heldForQuietHours: true
    });

    const isDevToolsEnabled = env.ENABLE_DEV_TOOLS === true && process.env.NODE_ENV !== 'production';

    res.status(200).json({
      nowIst: istDate.toISOString().replace('Z', '+05:30'),
      quietHoursActive: quietActive,
      nextSendAt: nextSendAt.toISOString(),
      heldCount,
      prefs: {
        email: user?.notificationPrefs ? user.notificationPrefs.email !== false : true,
        whatsapp: user?.notificationPrefs ? user.notificationPrefs.whatsapp !== false : true
      },
      hasPhone: !!(user?.phone && user.phone.trim()),
      devToolsEnabled: isDevToolsEnabled
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getStatus,
  getStatusLabel
};
