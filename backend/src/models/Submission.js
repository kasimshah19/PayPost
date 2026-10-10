const mongoose = require('mongoose');
const { SUBMISSION_STATUS, MAX_REVISIONS } = require('../constants');

const versionSchema = new mongoose.Schema({
  postUrl: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  note: { type: String }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  action: { type: String, enum: ['approved', 'revision_requested', 'rejected'], required: true },
  note: { type: String },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true }, // denormalized
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // denormalized
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // denormalized
  status: { type: String, enum: Object.values(SUBMISSION_STATUS), default: SUBMISSION_STATUS.SUBMITTED },
  postUrl: { 
    type: String, 
    required: true,
    validate: {
      validator: v => v.startsWith('https://') && v.includes('instagram.com'),
      message: 'postUrl must be a valid https Instagram URL'
    }
  },
  revisionCount: { type: Number, default: 0, max: MAX_REVISIONS },
  versions: [versionSchema],
  reviews: [reviewSchema],
  decidedAt: { type: Date },
  payoutBreakdown: {
    grossFeePaise: { type: Number, validate: Number.isInteger },
    platformFeePaise: { type: Number, validate: Number.isInteger },
    gstPaise: { type: Number, validate: Number.isInteger },
    tdsPaise: { type: Number, validate: Number.isInteger },
    netPayoutPaise: { type: Number, validate: Number.isInteger }
  }
}, { timestamps: true });

submissionSchema.index({ brand: 1, status: 1 });
submissionSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
