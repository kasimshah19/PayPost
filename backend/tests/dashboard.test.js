const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret',
  CLIENT_URL: 'http://localhost:5173,http://192.168.1.5:5173',
  ALLOWED_ORIGINS: ['http://localhost:5173', 'http://192.168.1.5:5173']
}));

const app = require('../src/app');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Application = require('../src/models/Application');
const Submission = require('../src/models/Submission');
const Withdrawal = require('../src/models/Withdrawal');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS, WITHDRAWAL_STATUS } = require('../src/constants');
const { generateToken } = require('../src/utils/jwt');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replSet.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Campaign.deleteMany({});
  await Application.deleteMany({});
  await Submission.deleteMany({});
  await Withdrawal.deleteMany({});
});

describe('Phase 9 Backend APIs', () => {
  let brand, brandToken, otherBrand, otherBrandToken;
  let creator, creatorToken, otherCreator, otherCreatorToken;

  beforeEach(async () => {
    brand = await User.create({ name: 'Brand 1', email: 'b1@b.com', passwordHash: 'h', role: 'brand' });
    brandToken = generateToken(brand);

    otherBrand = await User.create({ name: 'Brand 2', email: 'b2@b.com', passwordHash: 'h', role: 'brand' });
    otherBrandToken = generateToken(otherBrand);

    creator = await User.create({ name: 'Creator 1', email: 'c1@c.com', passwordHash: 'h', role: 'creator' });
    creatorToken = generateToken(creator);

    otherCreator = await User.create({ name: 'Creator 2', email: 'c2@c.com', passwordHash: 'h', role: 'creator' });
    otherCreatorToken = generateToken(otherCreator);
  });

  describe('GET /api/campaigns/mine/attention (brand)', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/campaigns/mine/attention');
      expect(res.status).toBe(401);
    });

    it('returns 403 when called by a creator', async () => {
      const res = await request(app)
        .get('/api/campaigns/mine/attention')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns only caller brand active campaigns, ignoring cancelled ones and other brands', async () => {
      // 1 active campaign with 1 applicant and 1 submission
      const campActive = await Campaign.create({
        brand: brand._id,
        title: 'Active Diwali',
        budgetPaise: 100000,
        perCreatorFeePaise: 20000,
        slots: 3,
        approvedCount: 0,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });

      const campCancelled = await Campaign.create({
        brand: brand._id,
        title: 'Cancelled Holi',
        budgetPaise: 50000,
        perCreatorFeePaise: 10000,
        slots: 2,
        approvedCount: 0,
        status: CAMPAIGN_STATUS.CANCELLED,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });

      const otherBrandCamp = await Campaign.create({
        brand: otherBrand._id,
        title: 'Other Brand Active',
        budgetPaise: 50000,
        perCreatorFeePaise: 10000,
        slots: 2,
        approvedCount: 0,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });

      // App for active campaign
      await Application.create({
        campaign: campActive._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPLIED,
        pitch: 'I love this brand!'
      });

      // App for cancelled campaign (should not appear)
      await Application.create({
        campaign: campCancelled._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPLIED,
        pitch: 'Pitch for cancelled'
      });

      // App for other brand (should not appear)
      await Application.create({
        campaign: otherBrandCamp._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPLIED,
        pitch: 'Pitch for other brand'
      });

      // Submission for active campaign
      await Submission.create({
        campaign: campActive._id,
        brand: brand._id,
        creator: creator._id,
        application: new mongoose.Types.ObjectId(),
        status: SUBMISSION_STATUS.SUBMITTED,
        postUrl: 'https://instagram.com/p/test12345',
        postUrlKey: 'test12345'
      });

      const res = await request(app)
        .get('/api/campaigns/mine/attention')
        .set('Authorization', `Bearer ${brandToken}`);

      expect(res.status).toBe(200);
      expect(res.body.counts).toEqual({
        pendingApplicants: 1,
        pendingSubmissions: 1,
        total: 2
      });

      expect(res.body.applicants.length).toBe(1);
      expect(res.body.applicants[0].campaignTitle).toBe('Active Diwali');
      expect(res.body.applicants[0].creator.name).toBe('Creator 1');
      expect(res.body.applicants[0].creator.email).toBeUndefined();
      expect(res.body.applicants[0].creator.phone).toBeUndefined();
      expect(res.body.applicants[0].canApprove).toBe(true);
      expect(res.body.applicants[0].cannotApproveReason).toBeNull();

      expect(res.body.submissions.length).toBe(1);
      expect(res.body.submissions[0].campaignTitle).toBe('Active Diwali');
      expect(res.body.submissions[0].creator.name).toBe('Creator 1');
      expect(res.body.submissions[0].postUrl).toBe('https://instagram.com/p/test12345');
    });

    it('reports cannotApproveReason when slots full, budget exhausted, or submission deadline passed', async () => {
      // 1. Slots full
      const campFull = await Campaign.create({
        brand: brand._id,
        title: 'Full Camp',
        budgetPaise: 100000,
        perCreatorFeePaise: 20000,
        slots: 1,
        approvedCount: 1,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });
      await Application.create({
        campaign: campFull._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPLIED
      });

      // 2. Budget not enough
      const campNoBudget = await Campaign.create({
        brand: brand._id,
        title: 'No Budget Camp',
        budgetPaise: 20000,
        perCreatorFeePaise: 20000,
        reservedPaise: 20000,
        slots: 5,
        approvedCount: 1,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });
      await Application.create({
        campaign: campNoBudget._id,
        creator: otherCreator._id,
        status: APPLICATION_STATUS.APPLIED
      });

      // 3. Submission deadline passed
      const campExpired = await Campaign.create({
        brand: brand._id,
        title: 'Expired Sub Deadline',
        budgetPaise: 100000,
        perCreatorFeePaise: 20000,
        slots: 5,
        approvedCount: 0,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() - 86400000 * 2),
        submissionDeadline: new Date(Date.now() - 86400000)
      });
      await Application.create({
        campaign: campExpired._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPLIED
      });

      const res = await request(app)
        .get('/api/campaigns/mine/attention')
        .set('Authorization', `Bearer ${brandToken}`);

      expect(res.status).toBe(200);
      const fullApp = res.body.applicants.find(a => a.campaignTitle === 'Full Camp');
      expect(fullApp.canApprove).toBe(false);
      expect(fullApp.cannotApproveReason).toBe('No slots left');

      const budgetApp = res.body.applicants.find(a => a.campaignTitle === 'No Budget Camp');
      expect(budgetApp.canApprove).toBe(false);
      expect(budgetApp.cannotApproveReason).toContain('Not enough budget');

      const expiredApp = res.body.applicants.find(a => a.campaignTitle === 'Expired Sub Deadline');
      expect(expiredApp.canApprove).toBe(false);
      expect(expiredApp.cannotApproveReason).toBe('Submission deadline has passed');
    });

    it('cuts lists to 20 while counts show real totals', async () => {
      const camp = await Campaign.create({
        brand: brand._id,
        title: 'Many Applicants Campaign',
        budgetPaise: 500000,
        perCreatorFeePaise: 10000,
        slots: 30,
        approvedCount: 0,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });

      const appsToInsert = [];
      for (let i = 0; i < 25; i++) {
        appsToInsert.push({
          campaign: camp._id,
          creator: new mongoose.Types.ObjectId(),
          status: APPLICATION_STATUS.APPLIED,
          pitch: `Pitch ${i}`
        });
      }
      await Application.insertMany(appsToInsert);

      const res = await request(app)
        .get('/api/campaigns/mine/attention')
        .set('Authorization', `Bearer ${brandToken}`);

      expect(res.status).toBe(200);
      expect(res.body.counts.pendingApplicants).toBe(25);
      expect(res.body.applicants.length).toBe(20);
    });
  });

  describe('GET /api/creator/next-actions', () => {
    it('returns 401 when unauthenticated and 403 for brand', async () => {
      const resUnauth = await request(app).get('/api/creator/next-actions');
      expect(resUnauth.status).toBe(401);

      const resBrand = await request(app)
        .get('/api/creator/next-actions')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(resBrand.status).toBe(403);
    });

    it('returns submit_work, resubmit, and withdrawal_failed with dueAt order', async () => {
      const camp1 = await Campaign.create({
        brand: brand._id,
        title: 'Summer Launch',
        budgetPaise: 100000,
        perCreatorFeePaise: 20000,
        slots: 3,
        approvedCount: 1,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 2 * 3600000), // 2 hours
        submissionDeadline: new Date(Date.now() + 4 * 3600000) // 4 hours from now
      });

      const app1 = await Application.create({
        campaign: camp1._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        approvedAt: new Date()
      });

      const camp2 = await Campaign.create({
        brand: brand._id,
        title: 'Winter Warmth',
        budgetPaise: 100000,
        perCreatorFeePaise: 20000,
        slots: 3,
        approvedCount: 1,
        status: CAMPAIGN_STATUS.ACTIVE,
        applicationDeadline: new Date(Date.now() + 86400000),
        submissionDeadline: new Date(Date.now() + 86400000 * 2)
      });

      const app2 = await Application.create({
        campaign: camp2._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        approvedAt: new Date()
      });

      // Submission with revision requested (due in 2 hours -> should come before submit_work)
      const subRev = await Submission.create({
        campaign: camp2._id,
        brand: brand._id,
        creator: creator._id,
        application: app2._id,
        status: SUBMISSION_STATUS.REVISION_REQUESTED,
        revisionCount: 1,
        revisionDueAt: new Date(Date.now() + 2 * 3600000),
        postUrl: 'https://instagram.com/p/rev123',
        postUrlKey: 'rev123'
      });

      // Failed withdrawal within 7 days
      const failedWithdrawal = await Withdrawal.create({
        user: creator._id,
        amountPaise: 10000,
        status: WITHDRAWAL_STATUS.FAILED,
        payoutDestination: { upiId: 'bad@upi' },
        failureReason: 'Account closed',
        processedAt: new Date(Date.now() - 3600000)
      });

      const res = await request(app)
        .get('/api/creator/next-actions')
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(3);

      // Order: resubmit (due in 2h) -> submit_work (due in 4h) -> withdrawal_failed (no dueAt)
      expect(res.body.items[0].type).toBe('resubmit');
      expect(res.body.items[0].campaignTitle).toBe('Winter Warmth');
      expect(res.body.items[0].submissionId.toString()).toBe(subRev._id.toString());

      expect(res.body.items[1].type).toBe('submit_work');
      expect(res.body.items[1].campaignTitle).toBe('Summer Launch');
      expect(res.body.items[1].applicationId.toString()).toBe(app1._id.toString());

      expect(res.body.items[2].type).toBe('withdrawal_failed');
      expect(res.body.items[2].path).toBe(`/creator/wallet?retry=${failedWithdrawal._id}`);

      // Now create a newer withdrawal -> withdrawal_failed should disappear
      await Withdrawal.create({
        user: creator._id,
        amountPaise: 10000,
        status: WITHDRAWAL_STATUS.COMPLETED,
        payoutDestination: { upiId: 'good@upi' },
        processedAt: new Date()
      });

      const resAfter = await request(app)
        .get('/api/creator/next-actions')
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(resAfter.body.items.find(i => i.type === 'withdrawal_failed')).toBeUndefined();
    });
  });

  describe('GET /api/campaigns (creator browse with q, sort, minFeePaise)', () => {
    beforeEach(async () => {
      await Campaign.create([
        {
          brand: brand._id,
          title: 'Special Diw(ali) Offer',
          budgetPaise: 100000,
          perCreatorFeePaise: 20000,
          slots: 5,
          approvedCount: 0,
          status: CAMPAIGN_STATUS.ACTIVE,
          applicationDeadline: new Date(Date.now() + 86400000 * 3),
          submissionDeadline: new Date(Date.now() + 86400000 * 5)
        },
        {
          brand: brand._id,
          title: 'Holi Spark Special',
          budgetPaise: 200000,
          perCreatorFeePaise: 50000,
          slots: 5,
          approvedCount: 0,
          status: CAMPAIGN_STATUS.ACTIVE,
          applicationDeadline: new Date(Date.now() + 86400000 * 1), // Ending sooner
          submissionDeadline: new Date(Date.now() + 86400000 * 4)
        },
        {
          brand: brand._id,
          title: 'New Year Party',
          budgetPaise: 50000,
          perCreatorFeePaise: 10000,
          slots: 5,
          approvedCount: 0,
          status: CAMPAIGN_STATUS.ACTIVE,
          applicationDeadline: new Date(Date.now() + 86400000 * 10),
          submissionDeadline: new Date(Date.now() + 86400000 * 12)
        }
      ]);
    });

    it('matches q safely with regex special characters like (, [, .* without crashing', async () => {
      const res = await request(app)
        .get('/api/campaigns?q=Diw(ali)')
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Special Diw(ali) Offer');
    });

    it('sorts by fee_desc and ending_soon correctly', async () => {
      const resFee = await request(app)
        .get('/api/campaigns?sort=fee_desc')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resFee.status).toBe(200);
      expect(resFee.body[0].perCreatorFeePaise).toBe(50000);
      expect(resFee.body[1].perCreatorFeePaise).toBe(20000);
      expect(resFee.body[2].perCreatorFeePaise).toBe(10000);

      const resEnding = await request(app)
        .get('/api/campaigns?sort=ending_soon')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resEnding.status).toBe(200);
      expect(resEnding.body[0].title).toBe('Holi Spark Special');
    });

    it('filters by minFeePaise', async () => {
      const resMin = await request(app)
        .get('/api/campaigns?minFeePaise=30000')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resMin.status).toBe(200);
      expect(resMin.body.length).toBe(1);
      expect(resMin.body[0].title).toBe('Holi Spark Special');
    });

    it('returns 400 for invalid sort query', async () => {
      const res = await request(app)
        .get('/api/campaigns?sort=invalid_sort')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 for negative or float minFeePaise', async () => {
      const resNegative = await request(app)
        .get('/api/campaigns?minFeePaise=-500')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resNegative.status).toBe(400);

      const resFloat = await request(app)
        .get('/api/campaigns?minFeePaise=12.5')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resFloat.status).toBe(400);
    });

    it('handles other regex special chars like [, \\, and .* safely without crashing', async () => {
      const resBracket = await request(app)
        .get('/api/campaigns?q=[test')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resBracket.status).toBe(200);

      const resSlash = await request(app)
        .get('/api/campaigns?q=\\test')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resSlash.status).toBe(200);

      const resWildcard = await request(app)
        .get('/api/campaigns?q=.*')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resWildcard.status).toBe(200);
    });

    it('never exposes sensitive budget fields in browse output', async () => {
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(200);
      res.body.forEach(c => {
        expect(c.budgetPaise).toBeUndefined();
        expect(c.reservedPaise).toBeUndefined();
        expect(c.paidOutPaise).toBeUndefined();
        expect(c.estimatedPayout).toBeDefined();
      });
    });
  });

  describe('CORS multiple origins', () => {
    it('allows origin listed in CLIENT_URL', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://192.168.1.5:5173');
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://192.168.1.5:5173');
    });

    it('blocks unlisted origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com');
      // Express cors middleware returns 500 with Error or blocks CORS
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
