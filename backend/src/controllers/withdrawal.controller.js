const { z } = require('zod');
const crypto = require('crypto');
const { MIN_WITHDRAWAL_PAISE } = require('../constants');
const withdrawalService = require('../services/withdrawalService');

const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

const requestWithdrawalSchema = z.object({
  amountPaise: z.number({
    required_error: 'amountPaise is required',
    invalid_type_error: 'amountPaise must be an integer'
  })
    .int('amountPaise must be an integer')
    .min(MIN_WITHDRAWAL_PAISE, `Minimum withdrawal is ${MIN_WITHDRAWAL_PAISE} paise (₹${MIN_WITHDRAWAL_PAISE / 100})`),
  upiId: z.string({
    required_error: 'upiId is required'
  })
    .regex(upiRegex, 'Invalid UPI ID format')
});

/**
 * POST /api/withdrawals
 * Creates a new withdrawal request for the authenticated creator.
 */
async function requestWithdrawal(req, res, next) {
  try {
    const parseResult = requestWithdrawalSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        message: parseResult.error.errors[0]?.message || 'Validation error',
        errors: parseResult.error.errors
      });
    }

    const { amountPaise, upiId } = parseResult.data;
    const clientKey = req.header('Idempotency-Key') || req.header('idempotency-key') || crypto.randomUUID();

    const result = await withdrawalService.requestWithdrawal({
      userId: req.user.id,
      amountPaise,
      upiId,
      clientKey
    });

    const statusCode = result.isReplay ? 200 : 201;
    return res.status(statusCode).json({
      withdrawal: result.withdrawal,
      wallet: {
        balancePaise: result.wallet.balancePaise,
        heldPaise: result.wallet.heldPaise
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
}

/**
 * GET /api/withdrawals
 * Returns paginated withdrawals for the authenticated creator.
 */
async function getWithdrawals(req, res, next) {
  try {
    const { status, page, limit } = req.query;
    const data = await withdrawalService.getWithdrawals(req.user.id, { status, page, limit });
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/withdrawals/:id
 * Returns single withdrawal detail with statusHistory.
 */
async function getWithdrawal(req, res, next) {
  try {
    const withdrawal = await withdrawalService.getWithdrawalById(req.user.id, req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }
    res.status(200).json(withdrawal);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requestWithdrawal,
  getWithdrawals,
  getWithdrawal
};
