const Wallet = require('../models/Wallet');
const LedgerEntry = require('../models/LedgerEntry');
const Campaign = require('../models/Campaign');
const Application = require('../models/Application');
const Submission = require('../models/Submission');
const { APPLICATION_STATUS, SUBMISSION_STATUS, LEDGER_DIRECTION } = require('../constants');

/**
 * Runs 5 strict integrity checks across the database:
 * 1. For every wallet: balancePaise equals sum of its ledger credits minus debits.
 * 2. For every wallet: running total of ledger entries exactly matches balanceAfterPaise on each entry.
 * 3. For every campaign: paidOutPaise equals the sum of gross fees of its approved submissions.
 * 4. For every campaign: reservedPaise equals the sum of feePaise of its currently 'approved' applications.
 * 5. For every approved submission: platformFee + gst + tds + net === gross.
 * 
 * Returns { ok: boolean, results: Array<{ name: string, ok: boolean, details: string }>, errors: string[] }
 */
async function checkIntegrity() {
  const results = [];
  const errors = [];

  // Check 1: Wallet balance equals net of ledger entries
  try {
    const wallets = await Wallet.find().lean();
    let check1Failures = 0;

    for (const wallet of wallets) {
      const entries = await LedgerEntry.find({ wallet: wallet._id }).lean();
      let netLedgerPaise = 0;
      for (const entry of entries) {
        if (entry.direction === LEDGER_DIRECTION.CREDIT) {
          netLedgerPaise += entry.amountPaise;
        } else if (entry.direction === LEDGER_DIRECTION.DEBIT) {
          netLedgerPaise -= entry.amountPaise;
        }
      }

      if (wallet.balancePaise !== netLedgerPaise) {
        check1Failures++;
        errors.push(`Wallet ${wallet._id} (user ${wallet.user}) balance ${wallet.balancePaise} != net ledger ${netLedgerPaise}`);
      }
    }

    results.push({
      name: 'Wallet balance matches ledger net',
      ok: check1Failures === 0,
      details: check1Failures === 0
        ? `Verified ${wallets.length} wallets.`
        : `${check1Failures} wallets failed ledger balance check.`
    });
  } catch (err) {
    results.push({ name: 'Wallet balance matches ledger net', ok: false, details: err.message });
    errors.push(err.message);
  }

  // Check 2: Running total on ledger entries matches balanceAfterPaise sequentially
  try {
    const wallets = await Wallet.find().lean();
    let check2Failures = 0;

    for (const wallet of wallets) {
      const entries = await LedgerEntry.find({ wallet: wallet._id }).sort({ createdAt: 1, _id: 1 }).lean();
      let running = 0;
      for (const entry of entries) {
        if (entry.direction === LEDGER_DIRECTION.CREDIT) {
          running += entry.amountPaise;
        } else if (entry.direction === LEDGER_DIRECTION.DEBIT) {
          running -= entry.amountPaise;
        }

        if (running !== entry.balanceAfterPaise) {
          check2Failures++;
          errors.push(`LedgerEntry ${entry._id} on wallet ${wallet._id} running total ${running} != balanceAfterPaise ${entry.balanceAfterPaise}`);
        }
      }
    }

    results.push({
      name: 'Ledger running balance continuity',
      ok: check2Failures === 0,
      details: check2Failures === 0
        ? `Verified chronological balance continuity across all ledger entries.`
        : `${check2Failures} ledger entries broke running total.`
    });
  } catch (err) {
    results.push({ name: 'Ledger running balance continuity', ok: false, details: err.message });
    errors.push(err.message);
  }

  // Check 3: Campaign paidOutPaise equals sum of gross fees of approved submissions
  try {
    const campaigns = await Campaign.find().lean();
    let check3Failures = 0;

    for (const campaign of campaigns) {
      const approvedSubs = await Submission.find({
        campaign: campaign._id,
        status: SUBMISSION_STATUS.APPROVED
      }).populate('application', 'feePaise').lean();

      let expectedPaidOut = 0;
      for (const sub of approvedSubs) {
        const gross = sub.payoutBreakdown?.grossFeePaise
          ?? sub.application?.feePaise
          ?? campaign.perCreatorFeePaise;
        expectedPaidOut += gross;
      }

      if (campaign.paidOutPaise !== expectedPaidOut) {
        check3Failures++;
        errors.push(`Campaign ${campaign._id} ("${campaign.title}") paidOutPaise ${campaign.paidOutPaise} != sum of approved submissions ${expectedPaidOut}`);
      }
    }

    results.push({
      name: 'Campaign paidOutPaise matches approved submissions',
      ok: check3Failures === 0,
      details: check3Failures === 0
        ? `Verified ${campaigns.length} campaigns.`
        : `${check3Failures} campaigns failed paidOutPaise check.`
    });
  } catch (err) {
    results.push({ name: 'Campaign paidOutPaise matches approved submissions', ok: false, details: err.message });
    errors.push(err.message);
  }

  // Check 4: Campaign reservedPaise equals sum of feePaise of applications in 'approved' status
  try {
    const campaigns = await Campaign.find().lean();
    let check4Failures = 0;

    for (const campaign of campaigns) {
      const approvedApps = await Application.find({
        campaign: campaign._id,
        status: APPLICATION_STATUS.APPROVED
      }).lean();

      let expectedReserved = 0;
      for (const app of approvedApps) {
        expectedReserved += (app.feePaise || campaign.perCreatorFeePaise || 0);
      }

      if (campaign.reservedPaise !== expectedReserved) {
        check4Failures++;
        errors.push(`Campaign ${campaign._id} ("${campaign.title}") reservedPaise ${campaign.reservedPaise} != sum of approved applications ${expectedReserved}`);
      }
    }

    results.push({
      name: 'Campaign reservedPaise matches approved applications',
      ok: check4Failures === 0,
      details: check4Failures === 0
        ? `Verified ${campaigns.length} campaigns.`
        : `${check4Failures} campaigns failed reservedPaise check.`
    });
  } catch (err) {
    results.push({ name: 'Campaign reservedPaise matches approved applications', ok: false, details: err.message });
    errors.push(err.message);
  }

  // Check 5: For every approved submission, platformFee + gst + tds + net === gross
  try {
    const approvedSubs = await Submission.find({ status: SUBMISSION_STATUS.APPROVED }).lean();
    let check5Failures = 0;

    for (const sub of approvedSubs) {
      if (!sub.payoutBreakdown) {
        check5Failures++;
        errors.push(`Approved submission ${sub._id} is missing payoutBreakdown.`);
        continue;
      }

      const { grossFeePaise, platformFeePaise, gstPaise, tdsPaise, netPayoutPaise } = sub.payoutBreakdown;
      const sum = platformFeePaise + gstPaise + tdsPaise + netPayoutPaise;

      if (sum !== grossFeePaise) {
        check5Failures++;
        errors.push(`Approved submission ${sub._id} breakdown sum ${sum} != grossFeePaise ${grossFeePaise}`);
      }
    }

    results.push({
      name: 'Approved submission fee breakdown integrity (platform + gst + tds + net === gross)',
      ok: check5Failures === 0,
      details: check5Failures === 0
        ? `Verified ${approvedSubs.length} approved submissions.`
        : `${check5Failures} submissions failed breakdown sum check.`
    });
  } catch (err) {
    results.push({ name: 'Approved submission fee breakdown integrity', ok: false, details: err.message });
    errors.push(err.message);
  }

  const allOk = results.every(r => r.ok);
  return {
    ok: allOk,
    results,
    errors
  };
}

module.exports = {
  checkIntegrity
};
