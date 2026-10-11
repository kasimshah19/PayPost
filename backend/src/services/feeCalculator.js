const { FEE_CONFIG } = require('../constants');

/**
 * Fee Calculation Formula (Phase 6):
 * 
 * The brand pays ONLY the gross fee (matching Phase 4 reservation).
 * Platform fees and taxes are deducted from the creator's gross fee:
 * 
 * 1. Platform Fee = round_half_up(gross * PLATFORM_FEE_PERCENT / 100) (default 10%)
 * 2. GST          = round_half_up(platformFee * GST_PERCENT_ON_PLATFORM_FEE / 100) (default 18% on platform fee)
 * 3. Payout Before TDS = gross - platformFee - GST
 * 4. TDS          = round_half_up(payoutBeforeTds * TDS_PERCENT_ON_PAYOUT / 100) (default 1%)
 * 5. Net Payout   = payoutBeforeTds - TDS
 * 
 * ASSUMPTION (recorded for README / audit):
 * "TDS is taken on the payout after platform fee and GST" (i.e. on payoutBeforeTds).
 * 
 * INVARIANTS:
 * - platformFeePaise + gstPaise + tdsPaise + netPayoutPaise === grossFeePaise (by algebraic construction)
 * - Every component >= 0 and is an integer in paise.
 * 
 * Rounding Half-Up (Integer Arithmetic):
 * Math.floor((x * pct + 50) / 100)
 */
function calculateBreakdown(grossFeePaise) {
  if (typeof grossFeePaise !== 'number' || !Number.isInteger(grossFeePaise) || grossFeePaise <= 0) {
    throw new Error('grossFeePaise must be a positive integer in paise');
  }

  const platformPercent = FEE_CONFIG.PLATFORM_FEE_PERCENT;
  const gstPercent = FEE_CONFIG.GST_PERCENT_ON_PLATFORM_FEE;
  const tdsPercent = FEE_CONFIG.TDS_PERCENT_ON_PAYOUT;

  const platformFeePaise = Math.floor((grossFeePaise * platformPercent + 50) / 100);
  const gstPaise = Math.floor((platformFeePaise * gstPercent + 50) / 100);
  const payoutBeforeTdsPaise = grossFeePaise - platformFeePaise - gstPaise;
  const tdsPaise = Math.floor((payoutBeforeTdsPaise * tdsPercent + 50) / 100);
  const netPayoutPaise = payoutBeforeTdsPaise - tdsPaise;

  return {
    grossFeePaise,
    platformFeePaise,
    gstPaise,
    payoutBeforeTdsPaise,
    tdsPaise,
    netPayoutPaise,
    rates: {
      platformPercent,
      gstPercent,
      tdsPercent
    },
    formulaVersion: 1
  };
}

module.exports = {
  calculateBreakdown
};
