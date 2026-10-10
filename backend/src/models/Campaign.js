const mongoose = require('mongoose');
const { CAMPAIGN_STATUS } = require('../constants');

const campaignSchema = new mongoose.Schema({
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, minlength: 3, maxlength: 120 },
  description: { type: String, maxlength: 2000 },
  budgetPaise: { 
    type: Number, 
    required: true, 
    min: [1, 'budgetPaise must be greater than 0'],
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  perCreatorFeePaise: { 
    type: Number, 
    required: true, 
    min: [1, 'perCreatorFeePaise must be greater than 0'],
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  slots: { type: Number, required: true, min: 1 },
  applicationDeadline: { type: Date, required: true },
  submissionDeadline: { type: Date, required: true },
  status: { type: String, enum: Object.values(CAMPAIGN_STATUS), default: CAMPAIGN_STATUS.ACTIVE },
  reservedPaise: { type: Number, default: 0 }, // fees locked for approved creators who are not yet paid
  paidOutPaise: { type: Number, default: 0 },  // gross fees already released to creators
  approvedCount: { type: Number, default: 0 }, // creators currently holding a slot
  cancelledAt: { type: Date },
  cancelReason: { type: String }
}, { timestamps: true });

// Invariants we must always keep: 
// 1. reservedPaise + paidOutPaise <= budgetPaise
// 2. approvedCount <= slots

campaignSchema.virtual('availablePaise').get(function() {
  return this.budgetPaise - this.reservedPaise - this.paidOutPaise;
});

campaignSchema.virtual('slotsLeft').get(function() {
  return this.slots - this.approvedCount;
});

campaignSchema.pre('validate', function(next) {
  if (this.submissionDeadline && this.applicationDeadline && this.submissionDeadline <= this.applicationDeadline) {
    this.invalidate('submissionDeadline', 'submissionDeadline must be after applicationDeadline');
  }
  if (this.perCreatorFeePaise != null && this.budgetPaise != null && this.perCreatorFeePaise > this.budgetPaise) {
    this.invalidate('perCreatorFeePaise', 'perCreatorFeePaise cannot exceed budgetPaise');
  }
  next();
});

campaignSchema.index({ brand: 1, createdAt: -1 });
campaignSchema.index({ status: 1, applicationDeadline: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
