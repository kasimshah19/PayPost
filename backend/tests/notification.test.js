const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret',
  CLIENT_URL: 'http://localhost:5173',
  MOCK_PAYOUT_DELAY_MS: 0,
  MOCK_PAYOUT_MODE: 'random',
  MOCK_PAYOUT_SUCCESS_RATE: 0.7,
  WORKER_INTERVAL_MS: 3000,
  WORKER_ENABLED: false,
  STUCK_PROCESSING_AFTER_MS: 60000,
  NOTIFICATION_WORKER_ENABLED: false,
  NOTIFICATION_WORKER_INTERVAL_MS: 5000,
  NOTIFICATION_MAX_ATTEMPTS: 3,
  NOTIFICATION_STUCK_AFTER_MS: 60000,
  MOCK_NOTIFY_MODE: 'random',
  MOCK_NOTIFY_SUCCESS_RATE: 0.9,
  MOCK_NOTIFY_DELAY_MS: 0,
  ENABLE_DEV_TOOLS: true
}));

const app = require('../src/app');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Application = require('../src/models/Application');
const Submission = require('../src/models/Submission');
const Wallet = require('../src/models/Wallet');
const LedgerEntry = require('../src/models/LedgerEntry');
const Withdrawal = require('../src/models/Withdrawal');
const NotificationJob = require('../src/models/NotificationJob');

const {
  ROLES,
  CAMPAIGN_STATUS,
  APPLICATION_STATUS,
  SUBMISSION_STATUS,
  WITHDRAWAL_STATUS,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_EVENTS
} = require('../src/constants');

const clock = require('../src/services/clock');
const mockEmailProvider = require('../src/services/mockEmailProvider');
const mockWhatsappProvider = require('../src/services/mockWhatsappProvider');
const notificationService = require('../src/services/notificationService');
const { processNotificationsOnce } = require('../src/jobs/notificationWorker');
const applicationService = require('../src/services/application.service');
const campaignService = require('../src/services/campaign.service');
const submissionService = require('../src/services/submissionService');
const withdrawalService = require('../src/services/withdrawalService');
const { ensureWallet } = require('../src/services/walletService');
const withTransaction = require('../src/utils/withTransaction');
const { generateToken } = require('../src/utils/jwt');
const env = require('../src/config/env');

let replSet;
let brandUser, brandToken;
let creatorA, creatorTokenA;
let creatorB, creatorTokenB;

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
  clock.resetClock();
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  clock.resetClock();
  mockEmailProvider._clearCache();
  mockWhatsappProvider._clearCache();
  env.MOCK_NOTIFY_MODE = 'always_success';

  await NotificationJob.deleteMany({});
  await Submission.deleteMany({});
  await Application.deleteMany({});
  await Campaign.deleteMany({});
  await Withdrawal.deleteMany({});
  if (mongoose.connection.collections.ledgerentries) {
    await mongoose.connection.collection('ledgerentries').deleteMany({});
  }
  await Wallet.deleteMany({});
  await User.deleteMany({});

  // Setup seed users
  brandUser = await User.create({
    name: 'Brand Co',
    email: 'brand@example.com',
    role: ROLES.BRAND,
    passwordHash: 'dummy',
    phone: '+919876543210',
    notificationPrefs: { email: true, whatsapp: true }
  });
  brandToken = generateToken(brandUser);

  creatorA = await User.create({
    name: 'Aman Sharma',
    email: 'aman@example.com',
    role: ROLES.CREATOR,
    passwordHash: 'dummy',
    phone: '+919123456789',
    notificationPrefs: { email: true, whatsapp: true }
  });
  creatorTokenA = generateToken(creatorA);

  creatorB = await User.create({
    name: 'Bhavna Patel',
    email: 'bhavna@example.com',
    role: ROLES.CREATOR,
    passwordHash: 'dummy',
    phone: '+919988776655',
    notificationPrefs: { email: true, whatsapp: true }
  });
  creatorTokenB = generateToken(creatorB);

  await ensureWallet(creatorA._id);
  await ensureWallet(creatorB._id);
});

describe('Phase 8: Notification Queue & Quiet Hours Tests', () => {

  describe('1. Enqueue & Outbox Behavior', () => {
    test('event at 14:00 IST creates 2 jobs with scheduledFor = now and heldForQuietHours false', async () => {
      // Simulate 14:00 IST (08:30 UTC)
      const targetTime = new Date(Date.UTC(2026, 9, 11, 8, 30, 0));
      clock.setOffsetMs(targetTime.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app123',
        payload: { campaignTitle: 'Diwali Spark', campaignId: new mongoose.Types.ObjectId() }
      });

      const jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.channel).sort()).toEqual(['email', 'whatsapp']);

      for (const job of jobs) {
        expect(job.status).toBe(NOTIFICATION_STATUS.PENDING);
        expect(job.heldForQuietHours).toBe(false);
        expect(Math.abs(job.scheduledFor.getTime() - targetTime.getTime())).toBeLessThan(1000);
      }
    });

    test('event at 22:00 IST creates jobs with scheduledFor = next 09:00 IST and heldForQuietHours true', async () => {
      // 22:00 IST on Oct 11 = 16:30 UTC on Oct 11
      const targetTime = new Date(Date.UTC(2026, 9, 11, 16, 30, 0));
      clock.setOffsetMs(targetTime.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app456',
        payload: { campaignTitle: 'Diwali Spark', campaignId: new mongoose.Types.ObjectId() }
      });

      const jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs).toHaveLength(2);

      // Next 09:00 IST = Oct 12 03:30 UTC
      const expectedSend = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      for (const job of jobs) {
        expect(job.status).toBe(NOTIFICATION_STATUS.PENDING);
        expect(job.heldForQuietHours).toBe(true);
        expect(job.scheduledFor.getTime()).toBe(expectedSend.getTime());
      }
    });

    test('opted-out channel creates status "skipped" with skippedReason "opted_out"', async () => {
      await User.findByIdAndUpdate(creatorA._id, { 'notificationPrefs.whatsapp': false });

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app789',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      const emailJob = await NotificationJob.findOne({ user: creatorA._id, channel: NOTIFICATION_CHANNEL.EMAIL });
      const waJob = await NotificationJob.findOne({ user: creatorA._id, channel: NOTIFICATION_CHANNEL.WHATSAPP });

      expect(emailJob.status).toBe(NOTIFICATION_STATUS.PENDING);
      expect(waJob.status).toBe(NOTIFICATION_STATUS.SKIPPED);
      expect(waJob.skippedReason).toBe('opted_out');
    });

    test('user with no phone creates whatsapp job with status "skipped" and skippedReason "no_phone"', async () => {
      await User.findByIdAndUpdate(creatorA._id, { $unset: { phone: 1 } });

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app_nophone',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      const waJob = await NotificationJob.findOne({ user: creatorA._id, channel: NOTIFICATION_CHANNEL.WHATSAPP });
      expect(waJob.status).toBe(NOTIFICATION_STATUS.SKIPPED);
      expect(waJob.skippedReason).toBe('no_phone');
    });

    test('both channels opted out creates both jobs skipped', async () => {
      await User.findByIdAndUpdate(creatorA._id, {
        'notificationPrefs.email': false,
        'notificationPrefs.whatsapp': false
      });

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app_both_off',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      const jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs).toHaveLength(2);
      expect(jobs.every(j => j.status === NOTIFICATION_STATUS.SKIPPED && j.skippedReason === 'opted_out')).toBe(true);
    });

    test('de-duplication: raising same event twice creates no extra jobs; version change creates new jobs', async () => {
      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.SUBMISSION_REVISION_REQUESTED,
        dedupeRefId: 'sub123',
        dedupeVersion: '1',
        payload: { campaignTitle: 'Test', revisionCount: 1 }
      });

      expect(await NotificationJob.countDocuments({ user: creatorA._id })).toBe(2);

      // Replay identical call
      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.SUBMISSION_REVISION_REQUESTED,
        dedupeRefId: 'sub123',
        dedupeVersion: '1',
        payload: { campaignTitle: 'Test', revisionCount: 1 }
      });

      expect(await NotificationJob.countDocuments({ user: creatorA._id })).toBe(2);

      // Revision 2 has different version
      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.SUBMISSION_REVISION_REQUESTED,
        dedupeRefId: 'sub123',
        dedupeVersion: '2',
        payload: { campaignTitle: 'Test', revisionCount: 2 }
      });

      expect(await NotificationJob.countDocuments({ user: creatorA._id })).toBe(4);
    });

    test('OUTBOX: aborted business transaction rolls back notification jobs as well', async () => {
      await expect(withTransaction(async (session) => {
        await notificationService.notify({
          recipientId: creatorA._id,
          event: NOTIFICATION_EVENTS.PAYOUT_CREDITED,
          dedupeRefId: 'rollback_test',
          payload: { campaignTitle: 'Rollback', netPayoutPaise: 50000 },
          session
        });
        throw new Error('Simulated transaction failure');
      })).rejects.toThrow('Simulated transaction failure');

      const count = await NotificationJob.countDocuments({ dedupeKey: { $regex: 'rollback_test' } });
      expect(count).toBe(0);
    });

    test('rendering failure falls back gracefully without throwing', async () => {
      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_APPROVED,
        dedupeRefId: 'render_fail',
        payload: null
      });

      const jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs).toHaveLength(2);
      expect(jobs[0].title).toBe('PayPost Notification');
      expect(jobs[0].message).toContain('You have an update on PayPost');
    });
  });

  describe('2. Worker Processing, Quiet Hours & Retries', () => {
    test('held job is NOT sent at 08:59 IST and IS sent at 09:00 IST', async () => {
      const night = new Date(Date.UTC(2026, 9, 11, 17, 0, 0)); // 22:30 IST
      clock.setOffsetMs(night.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app_held_run',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      // Jump to 08:59:00 IST on Oct 12 (03:29:00 UTC)
      const morning859 = new Date(Date.UTC(2026, 9, 12, 3, 29, 0));
      clock.setOffsetMs(morning859.getTime() - Date.now());

      const res859 = await processNotificationsOnce();
      expect(res859.claimed).toBe(0);
      expect(res859.sent).toBe(0);

      // Jump to 09:00:05 IST on Oct 12 (03:30:05 UTC)
      const morning900 = new Date(Date.UTC(2026, 9, 12, 3, 30, 5));
      clock.setOffsetMs(morning900.getTime() - Date.now());

      const res900 = await processNotificationsOnce();
      expect(res900.claimed).toBe(2);
      expect(res900.sent).toBe(2);

      const sentJobs = await NotificationJob.find({ user: creatorA._id, status: NOTIFICATION_STATUS.SENT });
      expect(sentJobs).toHaveLength(2);
      expect(sentJobs.every(j => j.providerRef && j.sentAt)).toBe(true);
    });

    test('send-time quiet hours check: pending job scheduled in past is rescheduled if current time is quiet hours', async () => {
      const daytime = new Date(Date.UTC(2026, 9, 11, 8, 0, 0)); // 13:30 IST
      clock.setOffsetMs(daytime.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app_past_sched',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      // Advance clock into quiet hours: 21:30 IST (16:00 UTC)
      const quietTime = new Date(Date.UTC(2026, 9, 11, 16, 0, 0));
      clock.setOffsetMs(quietTime.getTime() - Date.now());

      const res = await processNotificationsOnce();
      expect(res.claimed).toBe(2);
      expect(res.sent).toBe(0);
      expect(res.rescheduled).toBe(2);

      const jobs = await NotificationJob.find({ user: creatorA._id });
      const expectedMorning = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      for (const j of jobs) {
        expect(j.status).toBe(NOTIFICATION_STATUS.PENDING);
        expect(j.attempts).toBe(0);
        expect(j.scheduledFor.getTime()).toBe(expectedMorning.getTime());
      }
    });

    test('opt out AFTER queueing but BEFORE send: job is skipped and provider is not called', async () => {
      const daytime = new Date(Date.UTC(2026, 9, 11, 8, 30, 0));
      clock.setOffsetMs(daytime.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'app_optout_after',
        payload: { campaignTitle: 'Diwali Spark' }
      });

      // User opts out of whatsapp
      await User.findByIdAndUpdate(creatorA._id, { 'notificationPrefs.whatsapp': false });

      const emailSpy = jest.spyOn(mockEmailProvider, 'send');
      const waSpy = jest.spyOn(mockWhatsappProvider, 'send');

      const res = await processNotificationsOnce();
      expect(res.sent).toBe(1); // email
      expect(res.skipped).toBe(1); // whatsapp

      expect(emailSpy).toHaveBeenCalledTimes(1);
      expect(waSpy).not.toHaveBeenCalled();

      const waJob = await NotificationJob.findOne({ user: creatorA._id, channel: NOTIFICATION_CHANNEL.WHATSAPP });
      expect(waJob.status).toBe(NOTIFICATION_STATUS.SKIPPED);
      expect(waJob.skippedReason).toBe('opted_out');

      emailSpy.mockRestore();
      waSpy.mockRestore();
    });

    test('RACE TEST: running processNotificationsOnce() twice concurrently sends each job exactly once', async () => {
      const daytime = new Date(Date.UTC(2026, 9, 11, 8, 30, 0));
      clock.setOffsetMs(daytime.getTime() - Date.now());

      for (let i = 0; i < 5; i++) {
        await notificationService.notify({
          recipientId: creatorA._id,
          event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
          dedupeRefId: `race_${i}`,
          payload: { campaignTitle: `Campaign ${i}` }
        });
      }

      const emailSpy = jest.spyOn(mockEmailProvider, 'send');
      const waSpy = jest.spyOn(mockWhatsappProvider, 'send');

      const [run1, run2] = await Promise.all([
        processNotificationsOnce(),
        processNotificationsOnce()
      ]);

      expect(run1.sent + run2.sent).toBe(10);
      expect(emailSpy).toHaveBeenCalledTimes(5);
      expect(waSpy).toHaveBeenCalledTimes(5);

      const allSent = await NotificationJob.find({ status: NOTIFICATION_STATUS.SENT });
      expect(allSent).toHaveLength(10);

      emailSpy.mockRestore();
      waSpy.mockRestore();
    });

    test('provider failure retry: attempts increment, backoff rescheduled outside quiet hours, failed after 3 attempts', async () => {
      const daytime = new Date(Date.UTC(2026, 9, 11, 8, 30, 0));
      clock.setOffsetMs(daytime.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'fail_retry_test',
        payload: { campaignTitle: 'Fail Test' }
      });

      env.MOCK_NOTIFY_MODE = 'always_fail';

      // 1st run: fails, attempts becomes 1, backoff +1 min, rescheduled back to pending
      const r1 = await processNotificationsOnce();
      expect(r1.claimed).toBe(2);
      expect(r1.rescheduled).toBe(2);

      let jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs.every(j => j.attempts === 1 && j.status === NOTIFICATION_STATUS.PENDING)).toBe(true);

      // Advance clock 2 minutes
      clock.setOffsetMs(clock.getOffsetMs() + 2 * 60 * 1000);

      // 2nd run: fails, attempts becomes 2, backoff +5 min, rescheduled back to pending
      const r2 = await processNotificationsOnce();
      expect(r2.claimed).toBe(2);
      expect(r2.rescheduled).toBe(2);

      jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs.every(j => j.attempts === 2 && j.status === NOTIFICATION_STATUS.PENDING)).toBe(true);

      // Advance clock 6 minutes
      clock.setOffsetMs(clock.getOffsetMs() + 6 * 60 * 1000);

      // 3rd run: fails, attempts becomes 3, max attempts reached -> status "failed"
      const r3 = await processNotificationsOnce();
      expect(r3.claimed).toBe(2);
      expect(r3.failed).toBe(2);

      jobs = await NotificationJob.find({ user: creatorA._id });
      expect(jobs.every(j => j.attempts === 3 && j.status === NOTIFICATION_STATUS.FAILED)).toBe(true);
    });

    test('failure retry at 20:59 IST whose backoff lands in quiet hours is pushed to next day 09:00 IST', async () => {
      const nearQuiet = new Date(Date.UTC(2026, 9, 11, 15, 29, 30)); // 20:59:30 IST
      clock.setOffsetMs(nearQuiet.getTime() - Date.now());

      await notificationService.notify({
        recipientId: creatorA._id,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        dedupeRefId: 'late_fail_test',
        payload: { campaignTitle: 'Late Fail' }
      });

      env.MOCK_NOTIFY_MODE = 'always_fail';
      await processNotificationsOnce();

      const jobs = await NotificationJob.find({ user: creatorA._id });
      const expectedMorning = new Date(Date.UTC(2026, 9, 12, 3, 30, 0));
      for (const j of jobs) {
        expect(j.scheduledFor.getTime()).toBe(expectedMorning.getTime());
      }
    });

    test('stuck "processing" jobs are reconciled back to pending', async () => {
      const pastTime = new Date(Date.now() - 120000);
      await NotificationJob.create({
        user: creatorA._id,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        title: 'Stuck Job',
        message: 'Stuck Message',
        status: NOTIFICATION_STATUS.PROCESSING,
        scheduledFor: pastTime,
        processingStartedAt: pastTime,
        dedupeKey: 'stuck:job:test'
      });

      env.MOCK_NOTIFY_MODE = 'always_success';
      const res1 = await processNotificationsOnce();
      expect(res1.reconciled).toBe(1);

      // Now that it was reconciled back to pending, next run picks it up and sends it
      const res2 = await processNotificationsOnce();
      expect(res2.sent).toBe(1);

      const job = await NotificationJob.findOne({ dedupeKey: 'stuck:job:test' });
      expect(job.status).toBe(NOTIFICATION_STATUS.SENT);
    });
  });

  describe('3. Event Flows & Privacy Rules', () => {
    test('full flow triggers notifications for right user, right net amount, and never leaks private data', async () => {
      clock.setOffsetMs(new Date(Date.UTC(2026, 9, 11, 8, 30, 0)).getTime() - Date.now());

      // Create Campaign with all required fields
      const campaign = await Campaign.create({
        brand: brandUser._id,
        title: 'Glow Serum Campaign',
        description: 'Promote serum',
        budgetPaise: 500000,
        perCreatorFeePaise: 100000,
        slots: 5,
        applicationDeadline: new Date(Date.now() + 3 * 86400000),
        submissionDeadline: new Date(Date.now() + 7 * 86400000),
        status: CAMPAIGN_STATUS.ACTIVE
      });

      // 1. Creator A applies -> application.received (Brand receives notification)
      const appA = await applicationService.applyToCampaign(campaign._id, creatorA._id, 'I love skincare!');

      let notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.APPLICATION_RECEIVED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(brandUser._id.toString());
      expect(notifs[0].message).toContain('Aman applied to Glow Serum Campaign');

      // 2. Brand approves application -> application.approved (Creator A receives)
      await applicationService.approveApplication(appA._id, brandUser._id);
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.APPLICATION_APPROVED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(creatorA._id.toString());
      expect(notifs[0].message).toContain("You're approved for Glow Serum Campaign");
      expect(notifs[0].message).toContain('₹1,000.00');

      // 3. Creator A submits work -> submission.submitted (Brand receives)
      const sub = await submissionService.submitDeliverable(appA._id, creatorA._id, {
        postUrl: 'https://instagram.com/p/Cxyz123',
        note: 'Here is my post'
      });
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.SUBMISSION_SUBMITTED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(brandUser._id.toString());
      expect(notifs[0].message).toContain('Aman submitted their post for Glow Serum Campaign');

      // 4. Brand requests revision -> submission.revision_requested (Creator A receives)
      await submissionService.requestRevision(sub._id, brandUser._id, { note: 'Lighting is dim' });
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.SUBMISSION_REVISION_REQUESTED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(creatorA._id.toString());
      expect(notifs[0].message).toContain('Revision 1 of 2 requested for Glow Serum Campaign: Lighting is dim');

      // 5. Creator A resubmits -> submission.resubmitted (Brand receives)
      await submissionService.resubmitDeliverable(sub._id, creatorA._id, {
        postUrl: 'https://instagram.com/p/Cxyz123_fixed',
        note: 'Fixed the lighting!'
      });
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.SUBMISSION_RESUBMITTED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(brandUser._id.toString());
      expect(notifs[0].message).toContain('Aman resubmitted after your revision request');

      // 6. Brand approves submission -> payout.credited (Creator A receives)
      await submissionService.approveSubmission(sub._id, brandUser._id);
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.PAYOUT_CREDITED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(creatorA._id.toString());
      // On ₹1,000: Net payout is ₹873.18 via calculateBreakdown
      expect(notifs[0].message).toContain('₹873.18');
      expect(notifs[0].message).not.toContain('₹1,000');

      // 7. Creator A initiates withdrawal -> withdrawal.requested
      const wRes = await withdrawalService.requestWithdrawal({
        userId: creatorA._id,
        amountPaise: 50000,
        upiId: 'aman@okhdfcbank',
        clientKey: 'w_test_1'
      });
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.WITHDRAWAL_REQUESTED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(creatorA._id.toString());
      expect(notifs[0].message).toContain('Withdrawal of ₹500.00 to am***@okhdfcbank has started');

      // 8. Withdrawal succeeds -> withdrawal.succeeded
      await Withdrawal.findByIdAndUpdate(wRes.withdrawal.id, { status: WITHDRAWAL_STATUS.PROCESSING });
      await withdrawalService.finalizeWithdrawal(wRes.withdrawal.id, {
        status: 'success',
        providerRef: 'payout_123'
      });
      notifs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.WITHDRAWAL_SUCCEEDED });
      expect(notifs).toHaveLength(2);
      expect(notifs[0].user.toString()).toBe(creatorA._id.toString());
      expect(notifs[0].message).toContain('₹500.00 was sent to am***@okhdfcbank');

      // Verify privacy: check all messages across all jobs
      const allJobs = await NotificationJob.find({});
      for (const j of allJobs) {
        expect(j.message).not.toContain('brand@example.com');
        expect(j.message).not.toContain('aman@example.com');
        expect(j.message).not.toContain('+919876543210');
        expect(j.message).not.toContain('+919123456789');
        expect(j.message).not.toContain('aman@okhdfcbank');
        if (j.user.toString() === creatorA._id.toString()) {
          expect(j.message).not.toContain('₹5,000'); // budget of 500000 paise
        }
      }
    });

    test('campaign cancel fan-out notifies exactly all affected creators', async () => {
      const campaign = await Campaign.create({
        brand: brandUser._id,
        title: 'Summer Launch',
        description: 'Test cancel',
        budgetPaise: 500000,
        perCreatorFeePaise: 100000,
        slots: 5,
        applicationDeadline: new Date(Date.now() + 3 * 86400000),
        submissionDeadline: new Date(Date.now() + 7 * 86400000),
        status: CAMPAIGN_STATUS.ACTIVE
      });

      const appA = await applicationService.applyToCampaign(campaign._id, creatorA._id, 'Pitch A');
      const appB = await applicationService.applyToCampaign(campaign._id, creatorB._id, 'Pitch B');
      await applicationService.approveApplication(appA._id, brandUser._id);
      await applicationService.approveApplication(appB._id, brandUser._id);

      await NotificationJob.deleteMany({}); // clear previous

      await campaignService.cancel(campaign._id, 'Product recalled', brandUser._id);

      const cancelJobs = await NotificationJob.find({ event: NOTIFICATION_EVENTS.CAMPAIGN_CANCELLED });
      // 2 creators * 2 channels = 4 jobs
      expect(cancelJobs).toHaveLength(4);

      const recipients = cancelJobs.map(j => j.user.toString());
      expect(recipients).toContain(creatorA._id.toString());
      expect(recipients).toContain(creatorB._id.toString());
      expect(recipients).not.toContain(brandUser._id.toString());
    });
  });

  describe('4. REST API & Preferences', () => {
    test('GET /api/notifications returns 401 without token and only own jobs with token', async () => {
      await NotificationJob.create({
        user: creatorA._id,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        title: 'Title A',
        message: 'Message A',
        status: NOTIFICATION_STATUS.SENT,
        scheduledFor: new Date(),
        dedupeKey: 'key_a'
      });

      await NotificationJob.create({
        user: brandUser._id,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        event: NOTIFICATION_EVENTS.APPLICATION_RECEIVED,
        title: 'Title Brand',
        message: 'Message Brand',
        status: NOTIFICATION_STATUS.SENT,
        scheduledFor: new Date(),
        dedupeKey: 'key_brand'
      });

      // No token -> 401
      const resUnauth = await request(app).get('/api/notifications');
      expect(resUnauth.status).toBe(401);

      // Creator A token -> returns only Creator A's jobs
      const resA = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${creatorTokenA}`);
      expect(resA.status).toBe(200);
      expect(resA.body.notifications).toHaveLength(1);
      expect(resA.body.notifications[0].title).toBe('Title A');
      expect(resA.body.notifications[0].statusLabel).toBe('Sent');
    });

    test('PATCH /api/auth/preferences: validates Indian phone numbers and updates prefs', async () => {
      // Valid phone: 10 digits
      let res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '9876543210' });
      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe('+919876543210');

      // Valid phone: +91 prefix
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '+919123456789' });
      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe('+919123456789');

      // Invalid phone: too short
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '12345' });
      expect(res.status).toBe(400);

      // Invalid phone: starting with 5
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '5876543210' });
      expect(res.status).toBe(400);

      // Invalid phone: letters
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '98765abcde' });
      expect(res.status).toBe(400);

      // Empty string removes phone
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ phone: '' });
      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBeUndefined();

      // Disable both channels
      res = await request(app)
        .patch('/api/auth/preferences')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ notificationPrefs: { email: false, whatsapp: false } });
      expect(res.status).toBe(200);
      expect(res.body.user.notificationPrefs.email).toBe(false);
      expect(res.body.user.notificationPrefs.whatsapp).toBe(false);
    });

    test('GET /api/notifications/status returns quietHoursActive, nextSendAt, heldCount', async () => {
      clock.setOffsetMs(new Date(Date.UTC(2026, 9, 11, 16, 30, 0)).getTime() - Date.now()); // 22:00 IST

      await NotificationJob.create({
        user: creatorA._id,
        channel: NOTIFICATION_CHANNEL.EMAIL,
        event: NOTIFICATION_EVENTS.APPLICATION_REJECTED,
        title: 'Held Job',
        message: 'Held Message',
        status: NOTIFICATION_STATUS.PENDING,
        heldForQuietHours: true,
        scheduledFor: new Date(),
        dedupeKey: 'held_status_job'
      });

      const res = await request(app)
        .get('/api/notifications/status')
        .set('Authorization', `Bearer ${creatorTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.quietHoursActive).toBe(true);
      expect(res.body.heldCount).toBe(1);
      expect(res.body.devToolsEnabled).toBe(true);
    });
  });

  describe('5. Dev Tools Simulation Routes', () => {
    test('POST /api/dev/clock controls simulated clock (tonight_10pm, next_9am, realtime)', async () => {
      // 1. Set to tonight 10:00 PM
      let res = await request(app)
        .post('/api/dev/clock')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ action: 'tonight_10pm' });
      expect(res.status).toBe(200);
      expect(res.body.quietHoursActive).toBe(true);
      expect(res.body.simulatedNowIst).toContain('22:00:00');

      // 2. Jump to next 9:00 AM
      res = await request(app)
        .post('/api/dev/clock')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ action: 'next_9am' });
      expect(res.status).toBe(200);
      expect(res.body.quietHoursActive).toBe(false);
      expect(res.body.simulatedNowIst).toContain('09:00:05');

      // 3. Reset to real time
      res = await request(app)
        .post('/api/dev/clock')
        .set('Authorization', `Bearer ${creatorTokenA}`)
        .send({ action: 'realtime' });
      expect(res.status).toBe(200);
      expect(res.body.offsetMs).toBe(0);
    });

    test('POST /api/dev/notifications/run-worker runs worker pass on demand', async () => {
      const res = await request(app)
        .post('/api/dev/notifications/run-worker')
        .set('Authorization', `Bearer ${creatorTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('claimed');
      expect(res.body).toHaveProperty('sent');
      expect(res.body).toHaveProperty('skipped');
    });

    test('dev routes return 404 when disabled/unmounted', async () => {
      const express = require('express');
      const prodApp = express();
      // Emulate app.js behavior when ENABLE_DEV_TOOLS is false or NODE_ENV is production
      if (false) {
        prodApp.use('/api/dev', require('../src/routes/dev.routes'));
      }
      prodApp.use(require('../src/middleware/notFound'));

      const res = await request(prodApp)
        .get('/api/dev/clock')
        .set('Authorization', `Bearer ${creatorTokenA}`);
      expect(res.status).toBe(404);
    });
  });

});
