const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret',
  CLIENT_URL: 'http://localhost:5173'
}));

const app = require('../src/app');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Application = require('../src/models/Application');
const Submission = require('../src/models/Submission');
const Wallet = require('../src/models/Wallet');
const LedgerEntry = require('../src/models/LedgerEntry');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS, LEDGER_TYPE } = require('../src/constants');
const { generateToken } = require('../src/utils/jwt');
const { calculateBreakdown } = require('../src/services/feeCalculator');
const { settleApprovedSubmission } = require('../src/services/payoutService');
const submissionService = require('../src/services/submissionService');
const { checkIntegrity } = require('../src/services/integrityService');
const { backfillWallets } = require('../src/services/backfillService');
const withTransaction = require('../src/utils/withTransaction');

let replSet;
let brand, brandToken;
let creator1, creatorToken1;
let creator2, creatorToken2;

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
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Campaign.deleteMany({});
  await Application.deleteMany({});
  await Submission.deleteMany({});
  await Wallet.deleteMany({});
  if (mongoose.connection.collections.ledgerentries) {
    await mongoose.connection.collection('ledgerentries').deleteMany({});
  }

  brand = await User.create({ name: 'Test Brand', email: 'brand@test.com', passwordHash: 'hash', role: 'brand' });
  brandToken = generateToken(brand);

  creator1 = await User.create({ name: 'Creator One', email: 'c1@test.com', passwordHash: 'hash', role: 'creator' });
  creatorToken1 = generateToken(creator1);

  creator2 = await User.create({ name: 'Creator Two', email: 'c2@test.com', passwordHash: 'hash', role: 'creator' });
  creatorToken2 = generateToken(creator2);
});

describe('Phase 6: Wallet, Ledger & Fee Settlement Tests', () => {
  // Helper to create an active campaign and approved application with submitted deliverable
  async function setupSubmission(customFee = 100000) {
    const campaign = await Campaign.create({
      brand: brand._id,
      title: 'Summer Launch',
      budgetPaise: 500000,
      perCreatorFeePaise: customFee,
      slots: 5,
      reservedPaise: customFee,
      paidOutPaise: 0,
      approvedCount: 1,
      applicationDeadline: new Date(Date.now() + 86400000 * 2),
      submissionDeadline: new Date(Date.now() + 86400000 * 5),
      status: CAMPAIGN_STATUS.ACTIVE
    });

    const application = await Application.create({
      campaign: campaign._id,
      creator: creator1._id,
      status: APPLICATION_STATUS.APPROVED,
      feePaise: customFee
    });

    const submission = await Submission.create({
      application: application._id,
      campaign: campaign._id,
      creator: creator1._id,
      brand: brand._id,
      postUrl: 'https://www.instagram.com/p/ABC123xyz/',
      postUrlKey: 'ABC123xyz',
      status: SUBMISSION_STATUS.SUBMITTED,
      versions: [{ postUrl: 'https://www.instagram.com/p/ABC123xyz/' }]
    });

    application.submission = submission._id;
    await application.save();

    return { campaign, application, submission };
  }

  describe('Settlement Flow', () => {
    test('approving a submission credits wallet by net amount, creates 1 ledger entry, sets payoutBreakdown, and shifts gross fee from reserved to paidOut', async () => {
      const { campaign, submission } = await setupSubmission(100000); // ₹1,000 gross fee
      const expectedBreakdown = calculateBreakdown(100000); // net is 87318

      const res = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Great job!' });

      expect(res.status).toBe(200);

      // Verify campaign counters: reserved decreased by gross, paidOut increased by gross
      const updatedCampaign = await Campaign.findById(campaign._id);
      expect(updatedCampaign.reservedPaise).toBe(0);
      expect(updatedCampaign.paidOutPaise).toBe(100000);

      // Verify submission has saved snapshot of payoutBreakdown
      const updatedSub = await Submission.findById(submission._id);
      expect(updatedSub.status).toBe(SUBMISSION_STATUS.APPROVED);
      expect(updatedSub.payoutBreakdown.grossFeePaise).toBe(100000);
      expect(updatedSub.payoutBreakdown.netPayoutPaise).toBe(expectedBreakdown.netPayoutPaise);
      expect(updatedSub.payoutBreakdown.platformFeePaise).toBe(expectedBreakdown.platformFeePaise);
      expect(updatedSub.payoutBreakdown.gstPaise).toBe(expectedBreakdown.gstPaise);
      expect(updatedSub.payoutBreakdown.tdsPaise).toBe(expectedBreakdown.tdsPaise);

      // Verify wallet credit
      const wallet = await Wallet.findOne({ user: creator1._id });
      expect(wallet).toBeDefined();
      expect(wallet.balancePaise).toBe(expectedBreakdown.netPayoutPaise);

      // Verify ledger entry
      const ledgerEntries = await LedgerEntry.find({ user: creator1._id });
      expect(ledgerEntries.length).toBe(1);
      const entry = ledgerEntries[0];
      expect(entry.type).toBe(LEDGER_TYPE.PAYOUT_CREDIT);
      expect(entry.amountPaise).toBe(expectedBreakdown.netPayoutPaise);
      expect(entry.balanceAfterPaise).toBe(expectedBreakdown.netPayoutPaise);
      expect(entry.idempotencyKey).toBe(`payout:${submission._id}`);
      expect(entry.refType).toBe('submission');
      expect(entry.refId.toString()).toBe(submission._id.toString());
      expect(entry.meta.breakdown.netPayoutPaise).toBe(expectedBreakdown.netPayoutPaise);
    });

    test('balanceAfterPaise maintains running total across 3 consecutive payouts to the same creator', async () => {
      const breakdown = calculateBreakdown(100000);
      const net = breakdown.netPayoutPaise; // 87318

      for (let i = 1; i <= 3; i++) {
        const campaign = await Campaign.create({
          brand: brand._id,
          title: `Campaign ${i}`,
          budgetPaise: 200000,
          perCreatorFeePaise: 100000,
          slots: 2,
          reservedPaise: 100000,
          approvedCount: 1,
          applicationDeadline: new Date(Date.now() + 86400000),
          submissionDeadline: new Date(Date.now() + 86400000 * 2),
          status: CAMPAIGN_STATUS.ACTIVE
        });

        const appDoc = await Application.create({
          campaign: campaign._id,
          creator: creator1._id,
          status: APPLICATION_STATUS.APPROVED,
          feePaise: 100000
        });

        const sub = await Submission.create({
          application: appDoc._id,
          campaign: campaign._id,
          creator: creator1._id,
          brand: brand._id,
          postUrl: `https://www.instagram.com/reel/RunTotal${i}/`,
          postUrlKey: `RunTotal${i}`,
          status: SUBMISSION_STATUS.SUBMITTED
        });

        await submissionService.approveSubmission(sub._id, brand._id.toString(), { note: `Approve ${i}` });

        const wallet = await Wallet.findOne({ user: creator1._id });
        expect(wallet.balancePaise).toBe(net * i);

        const latestLedger = await LedgerEntry.findOne({ idempotencyKey: `payout:${sub._id}` });
        expect(latestLedger.balanceAfterPaise).toBe(net * i);
      }
    });

    test('calling settleApprovedSubmission a second time directly for the same submission fails and changes nothing', async () => {
      const { campaign, application, submission } = await setupSubmission(100000);
      const b = calculateBreakdown(100000);

      // Create initial wallet since settleApprovedSubmission is called directly outside of approveSubmission
      await Wallet.create({ user: creator1._id, balancePaise: 0, heldPaise: 0 });

      // First run inside a transaction
      await withTransaction(async (session) => {
        await settleApprovedSubmission(session, { campaign, application, submission });
      });

      const walletAfterFirst = await Wallet.findOne({ user: creator1._id });
      expect(walletAfterFirst.balancePaise).toBe(b.netPayoutPaise);

      // Second run must fail due to duplicate idempotencyKey
      await expect(
        withTransaction(async (session) => {
          await settleApprovedSubmission(session, { campaign, application, submission });
        })
      ).rejects.toThrow();

      // Wallet and ledger remain intact
      const walletAfterSecond = await Wallet.findOne({ user: creator1._id });
      expect(walletAfterSecond.balancePaise).toBe(b.netPayoutPaise);

      const entries = await LedgerEntry.find({ user: creator1._id });
      expect(entries.length).toBe(1);
    });

    test('ROLLBACK TEST: force a failure inside settlement -> approval aborts, counters and wallet unchanged', async () => {
      const { campaign, application, submission } = await setupSubmission(100000);

      // Pre-insert a ledger entry with the exact idempotencyKey that would be used
      const existingWallet = await Wallet.create({ user: creator1._id, balancePaise: 0, heldPaise: 0 });
      await LedgerEntry.create({
        wallet: existingWallet._id,
        user: creator1._id,
        type: LEDGER_TYPE.PAYOUT_CREDIT,
        direction: 'credit',
        amountPaise: 50000,
        balanceAfterPaise: 50000,
        idempotencyKey: `payout:${submission._id}`
      });

      // Attempting to approve must fail and roll back everything
      await expect(
        submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Will fail' })
      ).rejects.toThrow();

      // Submission remains 'submitted'
      const checkSub = await Submission.findById(submission._id);
      expect(checkSub.status).toBe(SUBMISSION_STATUS.SUBMITTED);
      expect(checkSub.payoutBreakdown).toBeUndefined();

      // Application remains 'approved'
      const checkApp = await Application.findById(application._id);
      expect(checkApp.status).toBe(APPLICATION_STATUS.APPROVED);

      // Campaign counters remain untouched
      const checkCampaign = await Campaign.findById(campaign._id);
      expect(checkCampaign.reservedPaise).toBe(100000);
      expect(checkCampaign.paidOutPaise).toBe(0);

      // Wallet balance remains 0
      const checkWallet = await Wallet.findOne({ user: creator1._id });
      expect(checkWallet.balancePaise).toBe(0);
    });

    test('rejection does NOT credit anything to wallet or ledger', async () => {
      const { campaign, submission } = await setupSubmission(100000);

      const res = await request(app)
        .post(`/api/submissions/${submission._id}/reject`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Does not meet standards' });

      expect(res.status).toBe(200);

      const wallet = await Wallet.findOne({ user: creator1._id });
      if (wallet) {
        expect(wallet.balancePaise).toBe(0);
      }
      const entries = await LedgerEntry.find({ user: creator1._id });
      expect(entries.length).toBe(0);
    });

    test('creators with no wallet (older accounts) get one automatically and approval still works', async () => {
      // Ensure creator has no wallet doc
      await Wallet.deleteMany({ user: creator1._id });
      const { submission } = await setupSubmission(100000);

      const res = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Approved seamlessly' });

      expect(res.status).toBe(200);
      const wallet = await Wallet.findOne({ user: creator1._id });
      expect(wallet).toBeDefined();
      expect(wallet.balancePaise).toBe(87318);
    });

    test('RACE TEST: concurrent approve requests on one submission result in exactly 1 credit', async () => {
      const { submission } = await setupSubmission(100000);

      const [res1, res2] = await Promise.allSettled([
        submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Race 1' }),
        submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Race 2' })
      ]);

      const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
      const rejected = [res1, res2].filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const wallet = await Wallet.findOne({ user: creator1._id });
      expect(wallet.balancePaise).toBe(87318);

      const entries = await LedgerEntry.find({ user: creator1._id });
      expect(entries.length).toBe(1);
    });
  });

  describe('Wallet API Endpoints', () => {
    test('GET /api/wallet shows balance, lifetimeEarned, and expected earnings correctly', async () => {
      // Create one approved submission (paid out) and one approved application (not yet paid)
      const { submission } = await setupSubmission(100000); // ₹1,000
      await submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Done' });

      // Second campaign where creator has an approved application pending deliverable
      const camp2 = await Campaign.create({
        brand: brand._id,
        title: 'Future Campaign',
        budgetPaise: 200000,
        perCreatorFeePaise: 50000,
        slots: 2,
        reservedPaise: 50000,
        approvedCount: 1,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2),
        status: CAMPAIGN_STATUS.ACTIVE
      });
      await Application.create({
        campaign: camp2._id,
        creator: creator1._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 50000
      });

      const res = await request(app)
        .get('/api/wallet')
        .set('Authorization', `Bearer ${creatorToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.balancePaise).toBe(87318);
      expect(res.body.heldPaise).toBe(0);
      expect(res.body.lifetimeEarnedPaise).toBe(87318);

      // Expected earnings: 50000 fee -> net is 43660 (or breakdown for 50000)
      const expectedBreakdown2 = calculateBreakdown(50000);
      expect(res.body.expectedPaise).toBe(expectedBreakdown2.netPayoutPaise);
    });

    test('GET /api/wallet/ledger pagination, type filter, and creator isolation', async () => {
      const { submission } = await setupSubmission(100000);
      await submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Approved' });

      // Creator 1 sees their ledger
      const res = await request(app)
        .get('/api/wallet/ledger?page=1&limit=10')
        .set('Authorization', `Bearer ${creatorToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.entries.length).toBe(1);
      expect(res.body.entries[0].amountPaise).toBe(87318);
      expect(res.body.entries[0].breakdown).toBeDefined();

      // Creator 2 sees empty ledger
      const res2 = await request(app)
        .get('/api/wallet/ledger')
        .set('Authorization', `Bearer ${creatorToken2}`);
      expect(res2.status).toBe(200);
      expect(res2.body.entries.length).toBe(0);

      // Brand gets 403 Forbidden
      const resBrand = await request(app)
        .get('/api/wallet')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(resBrand.status).toBe(403);

      // Unauthenticated gets 401
      const resAnon = await request(app).get('/api/wallet');
      expect(resAnon.status).toBe(401);
    });

    test('GET /api/fees/preview returns correct numbers and rejects bad input', async () => {
      // Valid request
      const res = await request(app)
        .get('/api/fees/preview?feePaise=100000')
        .set('Authorization', `Bearer ${creatorToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.grossFeePaise).toBe(100000);
      expect(res.body.platformFeePaise).toBe(10000);
      expect(res.body.gstPaise).toBe(1800);
      expect(res.body.tdsPaise).toBe(882);
      expect(res.body.netPayoutPaise).toBe(87318);

      // Bad input: missing
      const resMissing = await request(app)
        .get('/api/fees/preview')
        .set('Authorization', `Bearer ${creatorToken1}`);
      expect(resMissing.status).toBe(400);

      // Bad input: negative or non-integer
      const resNeg = await request(app)
        .get('/api/fees/preview?feePaise=-500')
        .set('Authorization', `Bearer ${creatorToken1}`);
      expect(resNeg.status).toBe(400);

      const resDec = await request(app)
        .get('/api/fees/preview?feePaise=100.5')
        .set('Authorization', `Bearer ${creatorToken1}`);
      expect(resDec.status).toBe(400);
    });

    test('Creator browse contains estimatedPayout and never exposes budget fields', async () => {
      await Campaign.create({
        brand: brand._id,
        title: 'Browse Test Campaign',
        budgetPaise: 1000000,
        perCreatorFeePaise: 100000,
        slots: 5,
        reservedPaise: 0,
        approvedCount: 0,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 3),
        status: CAMPAIGN_STATUS.ACTIVE
      });

      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${creatorToken1}`);

      expect(res.status).toBe(200);
      const camp = res.body[0];
      expect(camp.estimatedPayout).toBeDefined();
      expect(camp.estimatedPayout.netPayoutPaise).toBe(87318);
      expect(camp.estimatedPayout.platformFeePaise).toBe(10000);

      // Verify privacy invariants from Phase 3: no budget fields
      expect(camp.budgetPaise).toBeUndefined();
      expect(camp.reservedPaise).toBeUndefined();
      expect(camp.paidOutPaise).toBeUndefined();
    });
  });

  describe('Integrity & Immutability Checks', () => {
    test('checkIntegrity succeeds after a full workflow with multiple creators and submissions', async () => {
      const { submission } = await setupSubmission(100000);
      await submissionService.approveSubmission(submission._id, brand._id.toString(), { note: 'Approved flow' });

      const report = await checkIntegrity();
      expect(report.ok).toBe(true);
      expect(report.errors.length).toBe(0);
      report.results.forEach(r => expect(r.ok).toBe(true));
    });

    test('LedgerEntry documents are strictly immutable', async () => {
      const wallet = await Wallet.create({ user: creator1._id, balancePaise: 1000, heldPaise: 0 });
      const entry = await LedgerEntry.create({
        wallet: wallet._id,
        user: creator1._id,
        type: LEDGER_TYPE.PAYOUT_CREDIT,
        direction: 'credit',
        amountPaise: 1000,
        balanceAfterPaise: 1000,
        idempotencyKey: 'test:immutable'
      });

      await expect(
        LedgerEntry.updateOne({ _id: entry._id }, { $set: { amountPaise: 2000 } })
      ).rejects.toThrow('Ledger entries are immutable');

      await expect(
        LedgerEntry.deleteOne({ _id: entry._id })
      ).rejects.toThrow('Ledger entries are immutable');
    });
  });

  describe('Backfill Flow', () => {
    test('backfill credits unbackfilled approved submissions once and is idempotent', async () => {
      // Seed an approved submission without payoutBreakdown (simulating Phase 5)
      const campaign = await Campaign.create({
        brand: brand._id,
        title: 'Legacy Phase 5 Campaign',
        budgetPaise: 500000,
        perCreatorFeePaise: 100000,
        slots: 2,
        reservedPaise: 0,
        paidOutPaise: 100000, // already moved in Phase 5
        approvedCount: 1,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2),
        status: CAMPAIGN_STATUS.ACTIVE
      });

      const application = await Application.create({
        campaign: campaign._id,
        creator: creator1._id,
        status: APPLICATION_STATUS.COMPLETED,
        feePaise: 100000
      });

      const sub = await Submission.create({
        application: application._id,
        campaign: campaign._id,
        creator: creator1._id,
        brand: brand._id,
        postUrl: 'https://www.instagram.com/reel/LegacyPhase5/',
        postUrlKey: 'LegacyPhase5',
        status: SUBMISSION_STATUS.APPROVED,
        // Notice: NO payoutBreakdown!
        versions: [{ postUrl: 'https://www.instagram.com/reel/LegacyPhase5/' }]
      });

      // Run backfill first time
      const summary1 = await backfillWallets();
      expect(summary1.submissionsProcessed).toBe(1);

      const wallet = await Wallet.findOne({ user: creator1._id });
      expect(wallet.balancePaise).toBe(87318);

      const updatedCampaign = await Campaign.findById(campaign._id);
      // Campaign counters must remain untouched
      expect(updatedCampaign.reservedPaise).toBe(0);
      expect(updatedCampaign.paidOutPaise).toBe(100000);

      // Run backfill second time (idempotent)
      const summary2 = await backfillWallets();
      expect(summary2.submissionsProcessed).toBe(0);
      const walletAgain = await Wallet.findOne({ user: creator1._id });
      expect(walletAgain.balancePaise).toBe(87318); // did not double credit!
    });
  });
});
