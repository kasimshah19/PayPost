/**
 * Notification template rendering functions for each domain event.
 *
 * Privacy & Formatting Rules:
 * - Plain short messages with rupee amounts in formatINR.
 * - Dates in IST like "12 Oct, 6:30 PM IST".
 * - Never put another person's email, phone, full UPI, or brand's budget.
 * - Creators only ever see their own locked fee and net payout.
 * - Brands see the creator's first name only.
 */

const { formatINR } = require('../utils/money');
const { NOTIFICATION_EVENTS } = require('../constants');
const env = require('../config/env');

const CLIENT_URL = env.CLIENT_URL || 'http://localhost:5173';

/**
 * Formats a Date into IST string (e.g., "12 Oct, 6:30 PM IST")
 */
function formatIstDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const istMs = d.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = ist.getUTCDate();
  const month = months[ist.getUTCMonth()];
  
  let hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12

  return `${day} ${month}, ${hours}:${minutes} ${ampm} IST`;
}

/**
 * Returns first name of user
 */
function getFirstName(fullName) {
  if (!fullName) return 'A creator';
  return String(fullName).trim().split(' ')[0] || 'A creator';
}

/**
 * Map of event renderer functions
 */
const templates = {
  [NOTIFICATION_EVENTS.APPLICATION_RECEIVED]: (payload) => {
    const creatorName = getFirstName(payload.creatorName);
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const link = `${CLIENT_URL}/brand/campaigns/${payload.campaignId}`;
    return {
      title: `New application: ${campaignTitle}`,
      message: `${creatorName} applied to ${campaignTitle}. Review the application at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.APPLICATION_WITHDRAWN]: (payload) => {
    const creatorName = getFirstName(payload.creatorName);
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const link = `${CLIENT_URL}/brand/campaigns/${payload.campaignId}`;
    let extra = '';
    if (payload.wasApproved) {
      extra = ' The slot is open again.';
    }
    return {
      title: `Application withdrawn: ${campaignTitle}`,
      message: `${creatorName} withdrew from ${campaignTitle}.${extra} View details at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.APPLICATION_APPROVED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const feeFormatted = formatINR(payload.feePaise || 0);
    const deadlineFormatted = formatIstDate(payload.submissionDeadline);
    const link = `${CLIENT_URL}/creator/campaigns/${payload.campaignId}`;
    return {
      title: `You're approved for ${campaignTitle}!`,
      message: `You're approved for ${campaignTitle}. Your fee is locked at ${feeFormatted}. Submit your Instagram post by ${deadlineFormatted}. Submit link at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.APPLICATION_REJECTED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const link = `${CLIENT_URL}/creator/campaigns/${payload.campaignId}`;
    return {
      title: `Application update: ${campaignTitle}`,
      message: `Your application for ${campaignTitle} was not selected. Discover more campaigns at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.CAMPAIGN_CANCELLED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const reason = payload.cancelReason ? `: ${payload.cancelReason}` : '.';
    const link = `${CLIENT_URL}/creator/campaigns`;
    return {
      title: `Campaign cancelled: ${campaignTitle}`,
      message: `${campaignTitle} was cancelled by the brand${reason} Check other live campaigns at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.CAMPAIGN_DEADLINE_EXTENDED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const deadlineFormatted = formatIstDate(payload.newSubmissionDeadline);
    const link = `${CLIENT_URL}/creator/campaigns/${payload.campaignId}`;
    return {
      title: `Deadline extended: ${campaignTitle}`,
      message: `New submission deadline for ${campaignTitle}: ${deadlineFormatted}. View campaign at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.SUBMISSION_SUBMITTED]: (payload) => {
    const creatorName = getFirstName(payload.creatorName);
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const link = `${CLIENT_URL}/brand/campaigns/${payload.campaignId}`;
    return {
      title: `New submission: ${campaignTitle}`,
      message: `${creatorName} submitted their post for ${campaignTitle}. Review it now at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.SUBMISSION_RESUBMITTED]: (payload) => {
    const creatorName = getFirstName(payload.creatorName);
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const link = `${CLIENT_URL}/brand/campaigns/${payload.campaignId}`;
    return {
      title: `Post resubmitted: ${campaignTitle}`,
      message: `${creatorName} resubmitted after your revision request. Review update at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.SUBMISSION_REVISION_REQUESTED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const count = payload.revisionCount || 1;
    const note = payload.note ? `: ${payload.note}` : '.';
    const dueFormatted = formatIstDate(payload.revisionDueAt);
    const link = `${CLIENT_URL}/creator/campaigns/${payload.campaignId}`;
    return {
      title: `Revision requested: ${campaignTitle}`,
      message: `Revision ${count} of 2 requested for ${campaignTitle}${note} Resubmit by ${dueFormatted}. View details at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.SUBMISSION_REJECTED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const note = payload.note ? `: ${payload.note}` : '.';
    const link = `${CLIENT_URL}/creator/campaigns/${payload.campaignId}`;
    return {
      title: `Submission rejected: ${campaignTitle}`,
      message: `Your submission for ${campaignTitle} was rejected${note} This is final. View details at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.PAYOUT_CREDITED]: (payload) => {
    const campaignTitle = payload.campaignTitle || 'Campaign';
    const netFormatted = formatINR(payload.netPayoutPaise || 0);
    const link = `${CLIENT_URL}/creator/wallet`;
    return {
      title: `Payout credited: ${netFormatted}!`,
      message: `${netFormatted} has been credited to your wallet for ${campaignTitle}. View your wallet at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.WITHDRAWAL_REQUESTED]: (payload) => {
    const amountFormatted = formatINR(payload.amountPaise || 0);
    const maskedUpi = payload.maskedUpi || 'your account';
    const link = `${CLIENT_URL}/creator/wallet`;
    return {
      title: `Withdrawal initiated: ${amountFormatted}`,
      message: `Withdrawal of ${amountFormatted} to ${maskedUpi} has started. Track status at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.WITHDRAWAL_SUCCEEDED]: (payload) => {
    const amountFormatted = formatINR(payload.amountPaise || 0);
    const maskedUpi = payload.maskedUpi || 'your account';
    const link = `${CLIENT_URL}/creator/wallet`;
    return {
      title: `Withdrawal sent: ${amountFormatted}`,
      message: `${amountFormatted} was sent to ${maskedUpi}. View wallet at ${link}`,
      link
    };
  },

  [NOTIFICATION_EVENTS.WITHDRAWAL_FAILED]: (payload) => {
    const amountFormatted = formatINR(payload.amountPaise || 0);
    const reason = payload.reason || 'bank rejection';
    const link = `${CLIENT_URL}/creator/wallet`;
    return {
      title: `Withdrawal failed: ${amountFormatted}`,
      message: `Withdrawal of ${amountFormatted} failed: ${reason}. The amount is back in your wallet. View wallet at ${link}`,
      link
    };
  }
};

/**
 * Renders title, message, link for a given event and payload.
 * NEVER throws: on render error, returns safe fallback text.
 */
function renderTemplate(event, payload = {}) {
  try {
    const fn = templates[event];
    if (typeof fn === 'function') {
      return fn(payload);
    }
  } catch (err) {
    console.error(`[NotificationTemplates] Template render error for ${event}:`, err);
  }

  // Safe fallback
  const fallbackLink = `${CLIENT_URL}/notifications`;
  return {
    title: 'PayPost Notification',
    message: `You have an update on PayPost. View details at ${fallbackLink}`,
    link: fallbackLink
  };
}

module.exports = {
  renderTemplate,
  formatIstDate,
  getFirstName
};
