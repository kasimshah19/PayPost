const walletService = require('../services/walletService');
const { calculateBreakdown } = require('../services/feeCalculator');

/**
 * GET /api/wallet
 * Returns current wallet balances, lifetime earned, and expected earnings.
 * Restricted to creators.
 */
async function getWallet(req, res, next) {
  try {
    const summary = await walletService.getWalletSummary(req.user.id);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/wallet/ledger
 * Returns paginated ledger entries for the authenticated creator.
 * Restricted to creators.
 */
async function getLedger(req, res, next) {
  try {
    const { page, limit, type } = req.query;
    const ledger = await walletService.getLedgerEntries(req.user.id, { page, limit, type });
    res.status(200).json(ledger);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/fees/preview?feePaise=<int>
 * Returns calculated fee breakdown for a given gross fee in paise.
 * Available to any authenticated user (creator or brand).
 */
async function previewFee(req, res, next) {
  try {
    const { feePaise } = req.query;
    if (feePaise === undefined || feePaise === null || feePaise === '') {
      return res.status(400).json({ message: 'feePaise query parameter is required' });
    }

    const parsed = Number(feePaise);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return res.status(400).json({ message: 'feePaise must be a positive integer in paise' });
    }

    const breakdown = calculateBreakdown(parsed);
    res.status(200).json(breakdown);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWallet,
  getLedger,
  previewFee
};
