const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS, MIN_WITHDRAWAL_PAISE } = require('../constants');

const withdrawalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
  amountPaise: { type: Number, required: true, min: MIN_WITHDRAWAL_PAISE, validate: Number.isInteger },
  status: { type: String, enum: Object.values(WITHDRAWAL_STATUS), default: WITHDRAWAL_STATUS.PENDING },
  providerRef: { type: String },
  failureReason: { type: String },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  idempotencyKey: { type: String, unique: true, sparse: true }
}, { timestamps: true });

withdrawalSchema.index({ user: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
