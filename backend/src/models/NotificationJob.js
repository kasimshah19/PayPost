const mongoose = require('mongoose');
const { NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } = require('../constants');

const notificationJobSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: String, enum: Object.values(NOTIFICATION_CHANNEL), required: true },
  event: { type: String, required: true }, // e.g., "application.approved"
  title: { type: String },
  message: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: Object.values(NOTIFICATION_STATUS), default: NOTIFICATION_STATUS.PENDING },
  scheduledFor: { type: Date, required: true },
  sentAt: { type: Date },
  attempts: { type: Number, default: 0 },
  lastError: { type: String },
  skippedReason: { type: String },
  dedupeKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

notificationJobSchema.index({ status: 1, scheduledFor: 1 });
notificationJobSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
