import { paiseToRupees } from '../utils/money';

// Cache for deduplicating identical event notifications within 2 seconds
const recentToastCache = new Map();

/**
 * Maps incoming Socket.IO events to friendly human messages and deep links.
 * Returns null if the event should not produce a toast.
 *
 * @param {string} eventName
 * @param {Object} payload
 * @param {string} userRole - 'brand' | 'creator'
 * @returns {{ message: string, link: string | null, type: 'info' | 'success' | 'error' } | null}
 */
export function getToastConfig(eventName, payload, userRole) {
  if (!payload || !payload.showToast) {
    return null;
  }

  // Deduplication check: key = eventName + id (within 2 seconds)
  const dedupeId = payload.applicationId || payload.submissionId || payload.withdrawalId || payload.campaignId || '';
  const dedupeKey = `${eventName}:${payload.status || payload.reason || ''}:${dedupeId}`;
  const now = Date.now();
  const lastShown = recentToastCache.get(dedupeKey);

  if (lastShown && now - lastShown < 2000) {
    return null;
  }
  recentToastCache.set(dedupeKey, now);

  // Clean stale keys periodically
  if (recentToastCache.size > 50) {
    for (const [k, timestamp] of recentToastCache.entries()) {
      if (now - timestamp > 5000) {
        recentToastCache.delete(k);
      }
    }
  }

  const title = payload.campaignTitle ? `"${payload.campaignTitle}"` : 'Campaign';

  // 1. Application events
  if (eventName === 'application:changed') {
    if (userRole === 'brand') {
      if (payload.status === 'applied') {
        return {
          message: `New application on ${title}`,
          link: payload.campaignId ? `/brand/campaigns/${payload.campaignId}?tab=applicants${payload.applicationId ? `&focus=${payload.applicationId}` : ''}` : null,
          type: 'info'
        };
      }
      if (payload.status === 'withdrawn') {
        return {
          message: `A creator withdrew from ${title}`,
          link: payload.campaignId ? `/brand/campaigns/${payload.campaignId}?tab=applicants` : null,
          type: 'info'
        };
      }
    }

    if (userRole === 'creator') {
      if (payload.status === 'approved') {
        return {
          message: `You were approved for ${title}`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'success'
        };
      }
      if (payload.status === 'rejected') {
        return {
          message: `Your application for ${title} was not selected`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'info'
        };
      }
      if (payload.status === 'cancelled') {
        return {
          message: `${title} was cancelled`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'info'
        };
      }
    }
  }

  // 2. Submission events
  if (eventName === 'submission:changed') {
    if (userRole === 'brand') {
      if (payload.status === 'submitted') {
        return {
          message: `New submission to review on ${title}`,
          link: payload.campaignId ? `/brand/campaigns/${payload.campaignId}?tab=submissions${payload.submissionId ? `&focus=${payload.submissionId}` : ''}` : null,
          type: 'info'
        };
      }
      if (payload.status === 'resubmitted') {
        return {
          message: `A creator resubmitted for ${title}`,
          link: payload.campaignId ? `/brand/campaigns/${payload.campaignId}?tab=submissions${payload.submissionId ? `&focus=${payload.submissionId}` : ''}` : null,
          type: 'info'
        };
      }
    }

    if (userRole === 'creator') {
      if (payload.status === 'revision_requested') {
        return {
          message: `Revision requested on ${title}`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'info'
        };
      }
      if (payload.status === 'approved') {
        return {
          message: `Your submission for ${title} was approved`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'success'
        };
      }
      if (payload.status === 'rejected') {
        return {
          message: `Your submission for ${title} was rejected`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'error'
        };
      }
    }
  }

  // 3. Campaign events
  if (eventName === 'campaign:changed') {
    if (userRole === 'creator') {
      if (payload.reason === 'cancelled') {
        return {
          message: `${title} was cancelled`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'info'
        };
      }
      if (payload.reason === 'deadline_extended') {
        return {
          message: `New submission deadline for ${title}`,
          link: payload.campaignId ? `/creator/campaigns/${payload.campaignId}` : null,
          type: 'info'
        };
      }
    }
  }

  // 4. Wallet events
  if (eventName === 'wallet:changed') {
    const rupees = payload.amountPaise ? paiseToRupees(payload.amountPaise) : 0;
    if (payload.reason === 'payout_credited') {
      return {
        message: `₹${rupees} credited to your wallet`,
        link: '/creator/wallet',
        type: 'success'
      };
    }
    if (payload.reason === 'withdrawal_succeeded') {
      return {
        message: `Withdrawal of ₹${rupees} succeeded`,
        link: '/creator/wallet',
        type: 'success'
      };
    }
    if (payload.reason === 'withdrawal_reversed') {
      return {
        message: `Withdrawal failed, ₹${rupees} returned to your wallet`,
        link: '/creator/wallet',
        type: 'error'
      };
    }
  }

  // 5. Withdrawal events
  if (eventName === 'withdrawal:changed') {
    if (payload.status === 'succeeded') {
      return {
        message: 'Withdrawal succeeded',
        link: '/creator/wallet',
        type: 'success'
      };
    }
    if (payload.status === 'failed') {
      return {
        message: 'Withdrawal failed and was returned to your wallet',
        link: '/creator/wallet',
        type: 'error'
      };
    }
  }

  return null;
}
