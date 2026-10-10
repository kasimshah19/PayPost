const mongoose = require('mongoose');
const { LEDGER_TYPE, LEDGER_DIRECTION } = require('../constants');

const ledgerEntrySchema = new mongoose.Schema({
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: Object.values(LEDGER_TYPE), required: true },
  direction: { type: String, enum: Object.values(LEDGER_DIRECTION), required: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
  balanceAfterPaise: { type: Number, required: true, min: 0, validate: Number.isInteger },
  refType: { type: String, enum: ['submission', 'withdrawal'] },
  refId: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  idempotencyKey: { type: String, required: true, unique: true }
}, { timestamps: true });

// Ledger entries are append-only. No updates or deletes allowed.
const preventModifications = function(next) {
  next(new Error('Ledger entries are immutable'));
};

ledgerEntrySchema.pre('updateOne', preventModifications);
ledgerEntrySchema.pre('updateMany', preventModifications);
ledgerEntrySchema.pre('findOneAndUpdate', preventModifications);
ledgerEntrySchema.pre('findOneAndDelete', preventModifications);
ledgerEntrySchema.pre('deleteOne', preventModifications);
ledgerEntrySchema.pre('deleteMany', preventModifications);
ledgerEntrySchema.pre('remove', preventModifications);

ledgerEntrySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
