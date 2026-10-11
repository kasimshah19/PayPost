const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS, MIN_WITHDRAWAL_PAISE } = require('../constants');

const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  amountPaise: { type: Number, required: true, min: MIN_WITHDRAWAL_PAISE, validate: Number.isInteger },
  status: { type: String, enum: Object.values(WITHDRAWAL_STATUS), default: WITHDRAWAL_STATUS.PENDING },
  isActive: { type: Boolean },
  payoutDestination: {
    type: { type: String, default: 'upi' },
    upiId: { type: String, required: true }
  },
  providerRef: { type: String },
  failureReason: { type: String },
  requestedAt: { type: Date, default: Date.now },
  processingStartedAt: { type: Date },
  processedAt: { type: Date },
  attempts: { type: Number, default: 0 },
  idempotencyKey: { type: String, unique: true, sparse: true },
  statusHistory: [{
    from: { type: String },
    to: { type: String },
    at: { type: Date, default: Date.now },
    note: { type: String }
  }]
}, { timestamps: true });

// Enforce at most ONE active withdrawal per user at a time in the database
withdrawalSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
withdrawalSchema.index({ user: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
