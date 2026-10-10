const mongoose = require('mongoose');
const { APPLICATION_STATUS } = require('../constants');

const statusHistorySchema = new mongoose.Schema({
  from: { type: String },
  to: { type: String, required: true },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: Object.values(APPLICATION_STATUS), default: APPLICATION_STATUS.APPLIED },
  pitch: { type: String, maxlength: 1000 },
  feePaise: { type: Number, validate: Number.isInteger }, // snapshot of the creator's locked fee
  approvedAt: { type: Date },
  withdrawnAt: { type: Date },
  rejectedAt: { type: Date },
  expiredAt: { type: Date },
  statusHistory: [statusHistorySchema]
}, { timestamps: true });

applicationSchema.index({ campaign: 1, creator: 1 }, { unique: true });
applicationSchema.index({ campaign: 1, status: 1 });
applicationSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);
