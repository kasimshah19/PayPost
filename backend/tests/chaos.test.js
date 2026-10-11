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
const { processWithdrawalsOnce } = require('../src/jobs/withdrawalWorker');
const { processNotificationsOnce } = require('../src/jobs/notificationWorker');
const { checkIntegrity } = require('../src/services/integrityService');
const clock = require('../src/services/clock');
const mockPayoutProvider = require('../src/services/mockPayoutProvider');
const mockEmailProvider = require('../src/services/mockEmailProvider');
const mockWhatsappProvider = require('../src/services/mockWhatsappProvider');

// Seeded PRNG: mulberry32 (deterministic, fast, zero-dependency)
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

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

describe('Seeded Concurrency Chaos Test', () => {
  it('runs 5 rounds of concurrent actions and maintains all invariants', async () => {
    const rawSeed = process.env.CHAOS_SEED ? parseInt(process.env.CHAOS_SEED, 10) : 424242;
    const random = mulberry32(rawSeed);
    console.log(`[CHAOS TEST] Executing with seed: ${rawSeed}`);

    // Setup: 1 brand, 1 campaign (slots=3, budget for 2 creators @ 200000 paise each), 8 creators
    const brand = await User.create({
      name: 'Chaos Brand',
      email: 'brand_chaos@brand.com',
      passwordHash: 'hash',
      role: 'brand'
    });

    const creators = [];
    for (let i = 0; i < 8; i++) {
      const c = await User.create({
        name: `Creator ${i + 1}`,
        email: `creator_${i + 1}@creator.com`,
        passwordHash: 'hash',
        role: 'creator'
      });
      await Wallet.create({ user: c._id, balancePaise: 0, heldPaise: 0 });
      creators.push(c);
    }

    const appDeadline = new Date(Date.now() + 86400000 * 5);
    const subDeadline = new Date(Date.now() + 86400000 * 10);

    const campaign = await campaignService.create({
      title: 'Chaos Concurrency Campaign',
      description: 'Stress testing parallel race conditions',
      budgetPaise: 400000,
      perCreatorFeePaise: 200000,
      slots: 3,
      applicationDeadline: appDeadline,
      submissionDeadline: subDeadline
    }, brand._id);

    // Helper random selector
    const choose = (arr) => arr[Math.floor(random() * arr.length)];
    const randInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;

    const EXPECTED_STATUS_CODES = [400, 404, 409];

    // Run 5 rounds
    for (let round = 1; round <= 5; round++) {
      const actionCount = randInt(10, 14);
      const actionPromises = [];

      for (let a = 0; a < actionCount; a++) {
        const creator = choose(creators);
        const actionType = randInt(1, 8);

        switch (actionType) {
          case 1: {
            // Apply
            actionPromises.push(
              applicationService.applyToCampaign(campaign._id, creator._id, `Pitch from ${creator.email}`)
            );
            break;
          }
          case 2: {
            // Withdraw application
            actionPromises.push(
              (async () => {
                const app = await Application.findOne({ campaign: campaign._id, creator: creator._id });
                if (!app) {
                  const err = new Error('Not found');
                  err.status = 404;
                  throw err;
                }
                return applicationService.withdrawApplication(app._id, creator._id);
              })()
            );
            break;
          }
          case 3: {
            // Approve application
            actionPromises.push(
              (async () => {
                const app = await Application.findOne({ campaign: campaign._id, creator: creator._id });
                if (!app) {
                  const err = new Error('Not found');
                  err.status = 404;
                  throw err;
                }
                return applicationService.approveApplication(app._id, brand._id);
              })()
            );
            break;
          }
          case 4: {
            // Submit deliverable
            actionPromises.push(
              (async () => {
                const app = await Application.findOne({ campaign: campaign._id, creator: creator._id });
                if (!app) {
                  const err = new Error('Not found');
                  err.status = 404;
                  throw err;
                }
                return submissionService.submitDeliverable({
                  applicationId: app._id,
                  creatorId: creator._id,
                  instagramUrl: `https://instagram.com/p/chaos_${creator._id}_${round}_${a}`,
                  creatorNotes: 'Here is my chaos post!'
                });
              })()
            );
            break;
          }
          case 5: {
            // Review deliverable: randomly approve, request revision, or reject
            actionPromises.push(
              (async () => {
                const sub = await Submission.findOne({ campaign: campaign._id, creator: creator._id });
                if (!sub) {
                  const err = new Error('Not found');
                  err.status = 404;
                  throw err;
                }
                const reviewChoice = randInt(1, 3);
                if (reviewChoice === 1) {
                  return submissionService.approveSubmission({
                    submissionId: sub._id,
                    brandId: brand._id
                  });
                } else if (reviewChoice === 2) {
                  return submissionService.requestRevision({
                    submissionId: sub._id,
                    brandId: brand._id,
                    feedback: 'Please fix lighting and resubmit'
                  });
                } else {
                  return submissionService.rejectSubmission({
                    submissionId: sub._id,
                    brandId: brand._id,
                    reason: 'Does not match campaign guidelines'
                  });
                }
              })()
            );
            break;
          }
          case 6: {
            // Request withdrawal
            actionPromises.push(
              withdrawalService.requestWithdrawal({
                userId: creator._id,
                amountPaise: 100000,
                upiId: (random() > 0.5 ? 'success@mock' : 'fail@mock'),
                clientKey: `chaos-w-${round}-${a}-${creator._id}`
              })
            );
            break;
          }
          case 7: {
            // Run withdrawal worker
            actionPromises.push(processWithdrawalsOnce());
            break;
          }
          case 8: {
            // Run notification worker
            actionPromises.push(processNotificationsOnce());
            break;
          }
        }
      }

      // Fire all actions simultaneously in the round
      const results = await Promise.allSettled(actionPromises);

      // Verify errors were expected business errors (400, 404, 409), not uncaught crashes
      for (const res of results) {
        if (res.status === 'rejected') {
          const err = res.reason;
          const status = err.status || err.statusCode;
          expect(EXPECTED_STATUS_CODES).toContain(status);
        }
      }

      // Assert Invariants I2, I7, I8 using integrityService
      const integrity = await checkIntegrity();
      expect(integrity.ok).toBe(true);
      expect(integrity.errors).toHaveLength(0);

      // Invariant I2 extra direct check
      const currentCamp = await Campaign.findById(campaign._id);
      expect(currentCamp.reservedPaise + currentCamp.paidOutPaise).toBeLessThanOrEqual(currentCamp.budgetPaise);
      expect(currentCamp.approvedCount).toBeGreaterThanOrEqual(0);
      expect(currentCamp.approvedCount).toBeLessThanOrEqual(currentCamp.slots);
    }
  }, 30000);
});
