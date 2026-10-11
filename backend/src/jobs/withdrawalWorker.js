/**
 * Background worker for processing pending withdrawals and reconciling stuck payouts.
 */

const Withdrawal = require('../models/Withdrawal');
const { WITHDRAWAL_STATUS } = require('../constants');
const mockPayoutProvider = require('../services/mockPayoutProvider');
const { finalizeWithdrawal } = require('../services/withdrawalService');
const env = require('../config/env');

let isProcessing = false;

/**
 * Runs a single cycle of:
 * 1) Claim and process all pending withdrawals
 * 2) Reconcile withdrawals stuck in 'processing' status
 */
async function processWithdrawalsOnce() {
  // 1) CLAIM + SEND
  while (true) {
    const now = new Date();
    // Atomically claim one pending withdrawal
    const claimed = await Withdrawal.findOneAndUpdate(
      { status: WITHDRAWAL_STATUS.PENDING },
      {
        status: WITHDRAWAL_STATUS.PROCESSING,
        processingStartedAt: now,
        $inc: { attempts: 1 },
        $push: {
          statusHistory: {
            from: WITHDRAWAL_STATUS.PENDING,
            to: WITHDRAWAL_STATUS.PROCESSING,
            at: now,
            note: 'Claimed by payout worker'
          }
        }
      },
      { new: true }
    );

    if (!claimed) {
      break; // No more pending withdrawals
    }

    try {
      // Call provider OUTSIDE any DB transaction
      const payoutResult = await mockPayoutProvider.initiatePayout({
        idempotencyKey: claimed.idempotencyKey,
        amountPaise: claimed.amountPaise,
        upiId: claimed.payoutDestination?.upiId
      });

      // Persist providerRef before finalizing
      if (payoutResult && payoutResult.providerRef) {
        await Withdrawal.findByIdAndUpdate(claimed._id, {
          providerRef: payoutResult.providerRef
        });
      }

      // Finalize withdrawal state atomically
      await finalizeWithdrawal(claimed._id, payoutResult);
    } catch (err) {
      console.error(`[WithdrawalWorker] Error processing withdrawal ${claimed._id}:`, err);
    }
  }

  // 2) RECONCILE STUCK PROCESSING WITHDRAWALS
  const stuckCutoff = new Date(Date.now() - (env.STUCK_PROCESSING_AFTER_MS || 60000));
  const stuckList = await Withdrawal.find({
    status: WITHDRAWAL_STATUS.PROCESSING,
    processingStartedAt: { $lt: stuckCutoff }
  });

  for (const stuck of stuckList) {
    try {
      let result;
      if (stuck.providerRef) {
        // Query status of existing transfer
        result = await mockPayoutProvider.getPayoutStatus(stuck.providerRef);
      } else {
        // Crashed before providerRef was saved: re-initiate with SAME idempotencyKey
        result = await mockPayoutProvider.initiatePayout({
          idempotencyKey: stuck.idempotencyKey,
          amountPaise: stuck.amountPaise,
          upiId: stuck.payoutDestination?.upiId
        });

        if (result && result.providerRef) {
          await Withdrawal.findByIdAndUpdate(stuck._id, {
            providerRef: result.providerRef
          });
        }
      }

      await finalizeWithdrawal(stuck._id, result);
    } catch (err) {
      console.error(`[WithdrawalWorker] Error reconciling stuck withdrawal ${stuck._id}:`, err);
    }
  }
}

/**
 * Starts recurring background worker loop.
 */
function startWithdrawalWorker() {
  if (env.WORKER_ENABLED === false) {
    return null;
  }

  console.log(`[WithdrawalWorker] Background worker started (polling interval: ${env.WORKER_INTERVAL_MS}ms)`);

  const intervalId = setInterval(async () => {
    if (isProcessing) return; // Prevent overlapping runs
    isProcessing = true;
    try {
      await processWithdrawalsOnce();
    } catch (err) {
      console.error('[WithdrawalWorker] Loop execution error:', err);
    } finally {
      isProcessing = false;
    }
  }, env.WORKER_INTERVAL_MS || 3000);

  return intervalId;
}

module.exports = {
  processWithdrawalsOnce,
  startWithdrawalWorker
};
