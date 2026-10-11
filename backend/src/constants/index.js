const ROLES = Object.freeze({ BRAND: 'brand', CREATOR: 'creator' });
const CAMPAIGN_STATUS = Object.freeze({ ACTIVE: 'active', CANCELLED: 'cancelled', COMPLETED: 'completed' });
const APPLICATION_STATUS = Object.freeze({
  APPLIED: 'applied', APPROVED: 'approved', REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn', COMPLETED: 'completed', EXPIRED: 'expired', CANCELLED: 'cancelled'
});
const SUBMISSION_STATUS = Object.freeze({
  SUBMITTED: 'submitted', REVISION_REQUESTED: 'revision_requested',
  APPROVED: 'approved', REJECTED: 'rejected'
});
const LEDGER_TYPE = Object.freeze({
  PAYOUT_CREDIT: 'payout_credit', WITHDRAWAL_HOLD: 'withdrawal_hold', WITHDRAWAL_REVERSAL: 'withdrawal_reversal'
});
const LEDGER_DIRECTION = Object.freeze({ CREDIT: 'credit', DEBIT: 'debit' });
const WITHDRAWAL_STATUS = Object.freeze({ PENDING: 'pending', PROCESSING: 'processing', SUCCEEDED: 'succeeded', FAILED: 'failed' });
const NOTIFICATION_CHANNEL = Object.freeze({ EMAIL: 'email', WHATSAPP: 'whatsapp' });
const NOTIFICATION_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped'
});

const NOTIFICATION_EVENTS = Object.freeze({
  APPLICATION_RECEIVED: 'application.received',
  APPLICATION_WITHDRAWN: 'application.withdrawn',
  APPLICATION_APPROVED: 'application.approved',
  APPLICATION_REJECTED: 'application.rejected',
  CAMPAIGN_CANCELLED: 'campaign.cancelled',
  CAMPAIGN_DEADLINE_EXTENDED: 'campaign.deadline_extended',
  SUBMISSION_SUBMITTED: 'submission.submitted',
  SUBMISSION_RESUBMITTED: 'submission.resubmitted',
  SUBMISSION_REVISION_REQUESTED: 'submission.revision_requested',
  SUBMISSION_REJECTED: 'submission.rejected',
  PAYOUT_CREDITED: 'payout.credited',
  WITHDRAWAL_REQUESTED: 'withdrawal.requested',
  WITHDRAWAL_SUCCEEDED: 'withdrawal.succeeded',
  WITHDRAWAL_FAILED: 'withdrawal.failed'
});

const MAX_REVISIONS = 2;
const FEE_CONFIG = Object.freeze({ PLATFORM_FEE_PERCENT: 10, GST_PERCENT_ON_PLATFORM_FEE: 18, TDS_PERCENT_ON_PAYOUT: 1 });
const QUIET_HOURS = Object.freeze({ START_HOUR_IST: 21, END_HOUR_IST: 9 });
const MIN_WITHDRAWAL_PAISE = 10000;

const ALLOWED_APPLICATION_TRANSITIONS = {
  [APPLICATION_STATUS.APPLIED]: [APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED, APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.CANCELLED],
  [APPLICATION_STATUS.APPROVED]: [APPLICATION_STATUS.WITHDRAWN, APPLICATION_STATUS.COMPLETED, APPLICATION_STATUS.CANCELLED, APPLICATION_STATUS.EXPIRED, APPLICATION_STATUS.REJECTED]
};

module.exports = {
  ROLES, CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS,
  LEDGER_TYPE, LEDGER_DIRECTION, WITHDRAWAL_STATUS, NOTIFICATION_CHANNEL, NOTIFICATION_STATUS,
  NOTIFICATION_EVENTS,
  MAX_REVISIONS, FEE_CONFIG, QUIET_HOURS, MIN_WITHDRAWAL_PAISE,
  ALLOWED_APPLICATION_TRANSITIONS
};
