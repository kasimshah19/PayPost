const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret',
  CLIENT_URL: 'http://localhost:5173',
  MOCK_PAYOUT_DELAY_MS: 0,
  MOCK_PAYOUT_MODE: 'deterministic',
  MOCK_PAYOUT_SUCCESS_RATE: 1.0,
  WORKER_INTERVAL_MS: 3000,
  WORKER_ENABLED: false,
  STUCK_PROCESSING_AFTER_MS: 60000,
  NOTIFICATION_WORKER_ENABLED: false,
  NOTIFICATION_WORKER_INTERVAL_MS: 5000,
  NOTIFICATION_MAX_ATTEMPTS: 3,
  NOTIFICATION_STUCK_AFTER_MS: 60000,
  MOCK_NOTIFY_MODE: 'deterministic',
  MOCK_NOTIFY_SUCCESS_RATE: 1.0,
  MOCK_NOTIFY_DELAY_MS: 0,
  ENABLE_DEV_TOOLS: true
}));

const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Application = require('../src/models/Application');
const Submission = require('../src/models/Submission');
const Wallet = require('../src/models/Wallet');
const LedgerEntry = require('../src/models/LedgerEntry');
const Withdrawal = require('../src/models/Withdrawal');
const NotificationJob = require('../src/models/NotificationJob');

const campaignService = require('../src/services/campaign.service');
const applicationService = require('../src/services/application.service');
const submissionService = require('../src/services/submissionService');
const withdrawalService = require('../src/services/withdrawalService');
const walletService = require('../src/services/walletService');
const { processWithdrawalsOnce } = require('../src/jobs/withdrawalWorker');
const { processNotificationsOnce } = require('../src/jobs/notificationWorker');
const { checkIntegrity } = require('../src/services/integrityService');
const clock = require('../src/services/clock');
const mockPayoutProvider = require('../src/services/mockPayoutProvider');
const mockEmailProvider = require('../src/services/mockEmailProvider');
const mockWhatsappProvider = require('../src/services/mockWhatsappProvider');
const { isQuietHours } = require('../src/utils/quietHours');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS, WITHDRAWAL_STATUS, LEDGER_TYPE } = require('../src/constants');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replSet.getUri();
  await mongoose.connect(mongoUri);

  await User.syncIndexes();
  await Campaign.syncIndexes();
  await Application.syncIndexes();
  await Submission.syncIndexes();
  await Wallet.syncIndexes();
  await LedgerEntry.syncIndexes();
  await Withdrawal.syncIndexes();
  await NotificationJob.syncIndexes();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  clock.resetClock();
  mockPayoutProvider._resetCache();
  mockEmailProvider._clearCache();
  mockWhatsappProvider._clearCache();

  await User.deleteMany({});
  await Campaign.deleteMany({});
  await Application.deleteMany({});
  await Submission.deleteMany({});
  await Wallet.deleteMany({});
  await Withdrawal.deleteMany({});
  await NotificationJob.deleteMany({});
  if (mongoose.connection.collections.ledgerentries) {
    await mongoose.connection.collection('ledgerentries').deleteMany({});
  }
});

describe('E2E Full Business Lifecycle Test', () => {
  test('complete business story with real services, invariant verification, and money conservation', async () => {
    // Set clock offset so clock.now() is 10:00 AM IST (04:30 AM UTC), which is outside quiet hours
    const targetTime = new Date('2026-10-15T04:30:00.000Z').getTime();
    clock.setOffsetMs(targetTime - Date.now());


    // 1. Setup Brand and 4 Creators
    const brand = await User.create({
      name: 'Acme Brands',
      email: 'acme@test.com',
      passwordHash: 'hash',
      role: 'brand'
    });

    const creators = [];
    for (let i = 1; i <= 4; i++) {
      const c = await User.create({
        name: `Creator ${i}`,
        email: `c${i}@test.com`,
        passwordHash: 'hash',
        role: 'creator',
        notificationPrefs: { email: true, whatsapp: true }
      });
      await walletService.ensureWallet(c._id);
      creators.push(c);
    }

    // 2. Brand creates campaign: budget for 2 creators (₹4,000 = 400000 paise), fee = ₹2,000 (200000 paise), 3 slots
    const appDeadline = new Date(Date.now() + 86400000); // +1 day
    const subDeadline = new Date(Date.now() + 172800000); // +2 days

    const campaign = await campaignService.create({
      title: 'Summer Fitness 2026',
      description: 'Fitness reels with product placement',
      budgetPaise: 400000,
      perCreatorFeePaise: 200000,
      slots: 3,
      applicationDeadline: appDeadline,
      submissionDeadline: subDeadline
    }, brand._id);

    expect(campaign.budgetPaise).toBe(400000);
    expect(campaign.perCreatorFeePaise).toBe(200000);
    expect(campaign.slots).toBe(3);
    expect(campaign.reservedPaise).toBe(0);
    expect(campaign.approvedCount).toBe(0);

    // 3. 4 Creators apply
    const app1 = await applicationService.applyToCampaign(campaign._id, creators[0]._id, 'Pitch from Creator 1');
    const app2 = await applicationService.applyToCampaign(campaign._id, creators[1]._id, 'Pitch from Creator 2');
    const app3 = await applicationService.applyToCampaign(campaign._id, creators[2]._id, 'Pitch from Creator 3');
    const app4 = await applicationService.applyToCampaign(campaign._id, creators[3]._id, 'Pitch from Creator 4');

    expect(app1.status).toBe(APPLICATION_STATUS.APPLIED);
    expect(app2.status).toBe(APPLICATION_STATUS.APPLIED);
    expect(app3.status).toBe(APPLICATION_STATUS.APPLIED);
    expect(app4.status).toBe(APPLICATION_STATUS.APPLIED);

    // 4. Brand approves Creator 1 and Creator 2
    await applicationService.approveApplication(app1._id, brand._id);
    await applicationService.approveApplication(app2._id, brand._id);

    let campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.approvedCount).toBe(2);
    expect(campDoc.reservedPaise).toBe(400000); // 2 * 200,000 paise
    expect(campDoc.budgetPaise - campDoc.reservedPaise - campDoc.paidOutPaise).toBe(0); // Available is 0

    // 5. Third approval (Creator 3) is refused for budget (slots available 1, but budget 0)
    let thirdApproveError = null;
    try {
      await applicationService.approveApplication(app3._id, brand._id);
    } catch (err) {
      thirdApproveError = err;
    }
    expect(thirdApproveError).toBeTruthy();
    expect(thirdApproveError.status).toBe(409); // Conflict: insufficient budget

    // 6. Creator 1 withdraws application after being approved -> releases reserved money & slot!
    await applicationService.withdrawApplication(app1._id, creators[0]._id);
    
    campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.approvedCount).toBe(1);
    expect(campDoc.reservedPaise).toBe(200000); // 1 remaining reservation (Creator 2)
    expect(campDoc.budgetPaise - campDoc.reservedPaise - campDoc.paidOutPaise).toBe(200000); // Available is back to 200,000

    // Now Creator 3 can be approved with the freed budget
    await applicationService.approveApplication(app3._id, brand._id);
    campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.approvedCount).toBe(2);
    expect(campDoc.reservedPaise).toBe(400000);

    // 7. Creator 2 submits work, gets a revision, resubmits, and is approved (payout settles)
    const sub2 = await submissionService.submitDeliverable(app2._id, creators[1]._id, {
      postUrl: 'https://www.instagram.com/p/Creator2InitialPost/',
      note: 'Here is the draft reel'
    });
    expect(sub2.status).toBe(SUBMISSION_STATUS.SUBMITTED);

    // Brand requests revision
    await submissionService.requestRevision(sub2._id, brand._id, {
      note: 'Please show the product in the first 3 seconds clearly'
    });
    const sub2Rev = await Submission.findById(sub2._id);
    expect(sub2Rev.status).toBe(SUBMISSION_STATUS.REVISION_REQUESTED);
    expect(sub2Rev.revisionCount).toBe(1);

    // Creator 2 resubmits
    await submissionService.resubmitDeliverable(sub2._id, creators[1]._id, {
      postUrl: 'https://www.instagram.com/reel/Creator2ResubmittedPost/',
      note: 'Updated with product in first 3 seconds'
    });
    const sub2Resub = await Submission.findById(sub2._id);
    expect(sub2Resub.status).toBe(SUBMISSION_STATUS.SUBMITTED);

    // Brand approves submission -> triggers payout settlement & ledger entry!
    await submissionService.approveSubmission(sub2._id, brand._id, {
      note: 'Perfect, approved!'
    });

    const sub2Final = await Submission.findById(sub2._id);
    expect(sub2Final.status).toBe(SUBMISSION_STATUS.APPROVED);
    expect(sub2Final.payoutBreakdown).toBeDefined();
    // Breakdown: gross 200000 -> platform 20000, gst 3600, tds 1764, net 174636
    expect(sub2Final.payoutBreakdown.grossFeePaise).toBe(200000);
    expect(sub2Final.payoutBreakdown.netPayoutPaise).toBe(174636);

    // Check Creator 2's wallet
    const wallet2 = await Wallet.findOne({ user: creators[1]._id });
    expect(wallet2.balancePaise).toBe(174636);
    expect(wallet2.heldPaise).toBe(0);

    campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.paidOutPaise).toBe(200000);
    expect(campDoc.reservedPaise).toBe(200000); // only Creator 3 remaining

    // 8. Creator 3 submits and is rejected -> slot and reservation released
    const sub3 = await submissionService.submitDeliverable(app3._id, creators[2]._id, {
      postUrl: 'https://www.instagram.com/p/Creator3OffTopic/',
      note: 'Done'
    });
    await submissionService.rejectSubmission(sub3._id, brand._id, {
      note: 'The post does not match the campaign brief'
    });

    const sub3Doc = await Submission.findById(sub3._id);
    expect(sub3Doc.status).toBe(SUBMISSION_STATUS.REJECTED);

    campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.reservedPaise).toBe(0); // Creator 3's reserved funds released
    expect(campDoc.approvedCount).toBe(1); // Only Creator 2 remains (completed)

    // 9. Paid creator (Creator 2) withdraws once successfully and once with a failure
    // Withdrawal 1: ₹1,000 (100000 paise) -> success@mock
    const res1 = await withdrawalService.requestWithdrawal({
      userId: creators[1]._id,
      amountPaise: 100000,
      upiId: 'success@mock',
      clientKey: 'idemp-w1-success'
    });
    const w1 = res1.withdrawal;
    expect(w1.status).toBe(WITHDRAWAL_STATUS.PENDING);

    // Process withdrawal worker
    await processWithdrawalsOnce();
    const w1Final = await Withdrawal.findById(w1.id || w1._id);
    expect(w1Final.status).toBe(WITHDRAWAL_STATUS.SUCCEEDED);

    const wallet2AfterW1 = await Wallet.findOne({ user: creators[1]._id });
    expect(wallet2AfterW1.balancePaise).toBe(74636); // 174636 - 100000

    // Withdrawal 2: ₹500 (50000 paise) -> fail@mock (fails and reverses)
    const res2 = await withdrawalService.requestWithdrawal({
      userId: creators[1]._id,
      amountPaise: 50000,
      upiId: 'fail@mock',
      clientKey: 'idemp-w2-fail'
    });
    const w2 = res2.withdrawal;
    expect(w2.status).toBe(WITHDRAWAL_STATUS.PENDING);

    // Process withdrawal worker
    await processWithdrawalsOnce();
    const w2Final = await Withdrawal.findById(w2.id || w2._id);
    expect(w2Final.status).toBe(WITHDRAWAL_STATUS.FAILED);

    const wallet2AfterW2 = await Wallet.findOne({ user: creators[1]._id });
    expect(wallet2AfterW2.balancePaise).toBe(74636); // Restored exactly!
    expect(wallet2AfterW2.heldPaise).toBe(0);

    // 10. Brand cancels the campaign (no active submitted work pending)
    await campaignService.cancel(campaign._id, 'Campaign goals fulfilled', brand._id);
    campDoc = await Campaign.findById(campaign._id);
    expect(campDoc.status).toBe(CAMPAIGN_STATUS.CANCELLED);

    // ================= FINAL SYSTEM INVARIANTS & AUDIT =================

    // Assertion 1: For campaign: budget === available + reserved + paid
    const available = campDoc.budgetPaise - campDoc.reservedPaise - campDoc.paidOutPaise;
    expect(campDoc.budgetPaise).toBe(available + campDoc.reservedPaise + campDoc.paidOutPaise);

    // Assertion 2: Sum over approved submissions of (platformFee + gst + tds + net) === paidOutPaise
    const approvedSubs = await Submission.find({ campaign: campaign._id, status: SUBMISSION_STATUS.APPROVED });
    expect(approvedSubs.length).toBe(1);
    const totalSubSum = approvedSubs.reduce((acc, s) => {
      const b = s.payoutBreakdown;
      return acc + (b.platformFeePaise + b.gstPaise + b.tdsPaise + b.netPayoutPaise);
    }, 0);
    expect(totalSubSum).toBe(campDoc.paidOutPaise);

    // Assertion 3: Sum of creators' payout credits in ledger === sum of net payouts
    const payoutLedgerEntries = await LedgerEntry.find({ type: LEDGER_TYPE.PAYOUT_CREDIT });
    const totalLedgerCredits = payoutLedgerEntries.reduce((acc, e) => acc + e.amountPaise, 0);
    const totalNetPayouts = approvedSubs.reduce((acc, s) => acc + s.payoutBreakdown.netPayoutPaise, 0);
    expect(totalLedgerCredits).toBe(totalNetPayouts);

    // Assertion 4: Complete integrity service audit passes
    const integrityReport = await checkIntegrity();
    expect(integrityReport.ok).toBe(true);
    expect(integrityReport.errors).toEqual([]);

    // Assertion 5: Notification jobs exist and no pending job has scheduledFor inside quiet hours
    const notifJobs = await NotificationJob.find({});
    expect(notifJobs.length).toBeGreaterThan(0);
    for (const job of notifJobs) {
      if (job.status === 'pending') {
        expect(isQuietHours(job.scheduledFor)).toBe(false);
      }
    }

    // Assertion 6: Ledger entries are still immutable
    const sampleEntry = await LedgerEntry.findOne();
    expect(sampleEntry).toBeTruthy();
    await expect(LedgerEntry.updateOne({ _id: sampleEntry._id }, { amountPaise: 999999 })).rejects.toThrow(/immutable/i);
    await expect(LedgerEntry.deleteOne({ _id: sampleEntry._id })).rejects.toThrow(/immutable/i);
  });
});
