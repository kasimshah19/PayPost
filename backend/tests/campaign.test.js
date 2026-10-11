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
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS } = require('../src/constants');
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
});

describe('Campaign API', () => {
  let brand, brandToken, creator, creatorToken;
  
  beforeEach(async () => {
    brand = await User.create({ name: 'Brand', email: 'b@b.com', passwordHash: 'h', role: 'brand' });
    brandToken = generateToken(brand);
    creator = await User.create({ name: 'Creator', email: 'c@c.com', passwordHash: 'h', role: 'creator' });
    creatorToken = generateToken(creator);
  });

  describe('POST /api/campaigns (create)', () => {
    const validPayload = {
      title: 'Test Campaign',
      budgetPaise: 100000,
      perCreatorFeePaise: 10000,
      slots: 5,
      applicationDeadline: new Date(Date.now() + 86400000).toISOString(),
      submissionDeadline: new Date(Date.now() + 86400000 * 2).toISOString()
    };

    it('creates campaign as brand', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send(validPayload);
      expect(res.status).toBe(201);
      expect(res.body.title).toBe(validPayload.title);
      expect(res.body.status).toBe(CAMPAIGN_STATUS.ACTIVE);
    });

    it('rejects creator', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${creatorToken}`).send(validPayload);
      expect(res.status).toBe(403);
    });

    it('rejects missing token', async () => {
      const res = await request(app).post('/api/campaigns').send(validPayload);
      expect(res.status).toBe(401);
    });

    it('rejects fee > budget', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send({
        ...validPayload, perCreatorFeePaise: 200000
      });
      expect(res.status).toBe(400);
    });

    it('rejects slots 0', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send({
        ...validPayload, slots: 0
      });
      expect(res.status).toBe(400);
    });

    it('rejects float paise', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send({
        ...validPayload, budgetPaise: 1000.50
      });
      expect(res.status).toBe(400);
    });

    it('rejects past applicationDeadline', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send({
        ...validPayload, applicationDeadline: new Date(Date.now() - 10000).toISOString()
      });
      expect(res.status).toBe(400);
    });

    it('rejects submissionDeadline before applicationDeadline', async () => {
      const res = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${brandToken}`).send({
        ...validPayload, 
        applicationDeadline: new Date(Date.now() + 86400000 * 2).toISOString(),
        submissionDeadline: new Date(Date.now() + 86400000).toISOString()
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/campaigns/mine and /:id', () => {
    let campaign1, campaign2;
    beforeEach(async () => {
      campaign1 = await Campaign.create({
        brand: brand._id, title: 'Campaign 1', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5,
        applicationDeadline: new Date(Date.now() + 86400), submissionDeadline: new Date(Date.now() + 172800),
        status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 0, paidOutPaise: 0, approvedCount: 0
      });
      const otherBrand = await User.create({ name: 'B2', email: 'b2@b.com', passwordHash: 'h', role: 'brand' });
      campaign2 = await Campaign.create({
        brand: otherBrand._id, title: 'Campaign 2', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5,
        applicationDeadline: new Date(Date.now() + 86400), submissionDeadline: new Date(Date.now() + 172800),
        status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 0, paidOutPaise: 0, approvedCount: 0
      });
    });

    it('returns only my campaigns on /mine', async () => {
      const res = await request(app).get('/api/campaigns/mine').set('Authorization', `Bearer ${brandToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]._id).toBe(campaign1._id.toString());
    });

    it('denies access to other brand campaign on /:id', async () => {
      const res = await request(app).get(`/api/campaigns/${campaign2._id}`).set('Authorization', `Bearer ${brandToken}`);
      expect(res.status).toBe(404);
    });

    it('returns summary numbers correctly', async () => {
      const res = await request(app).get('/api/campaigns/mine/summary').set('Authorization', `Bearer ${brandToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalCampaigns).toBe(1);
      expect(res.body.totalBudgetPaise).toBe(100);
    });
  });

  describe('GET /api/campaigns (creator browse)', () => {
    it('excludes cancelled, past deadline, full campaigns, and sensitive fields', async () => {
      await Campaign.create([
        { brand: brand._id, title: 'Active', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5, applicationDeadline: new Date(Date.now() + 86400000), submissionDeadline: new Date(Date.now() + 172800000), status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 0, paidOutPaise: 0, approvedCount: 0 },
        { brand: brand._id, title: 'Cancelled', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5, applicationDeadline: new Date(Date.now() + 86400000), submissionDeadline: new Date(Date.now() + 172800000), status: CAMPAIGN_STATUS.CANCELLED, reservedPaise: 0, paidOutPaise: 0, approvedCount: 0 },
        { brand: brand._id, title: 'Past', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5, applicationDeadline: new Date(Date.now() - 86400000), submissionDeadline: new Date(Date.now() + 172800000), status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 0, paidOutPaise: 0, approvedCount: 0 },
        { brand: brand._id, title: 'Full', budgetPaise: 100, perCreatorFeePaise: 10, slots: 5, applicationDeadline: new Date(Date.now() + 86400000), submissionDeadline: new Date(Date.now() + 172800000), status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 0, paidOutPaise: 0, approvedCount: 5 }
      ]);
      const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Active');
      expect(res.body[0].budgetPaise).toBeUndefined();
    });
  });

  describe('PATCH /api/campaigns/:id (edit)', () => {
    let campaign;
    beforeEach(async () => {
      campaign = await Campaign.create({
        brand: brand._id, title: 'Campaign 1', budgetPaise: 1000, perCreatorFeePaise: 100, slots: 5,
        applicationDeadline: new Date(Date.now() + 86400000), submissionDeadline: new Date(Date.now() + 172800000),
        status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 200, paidOutPaise: 0, approvedCount: 2
      });
    });

    it('rejects budget below reserved', async () => {
      const res = await request(app).patch(`/api/campaigns/${campaign._id}`).set('Authorization', `Bearer ${brandToken}`).send({ budgetPaise: 100 });
      expect(res.status).toBe(400);
    });

    it('rejects slots below approvedCount', async () => {
      const res = await request(app).patch(`/api/campaigns/${campaign._id}`).set('Authorization', `Bearer ${brandToken}`).send({ slots: 1 });
      expect(res.status).toBe(400);
    });

    it('rejects earlier deadline if hasApprovals', async () => {
      const res = await request(app).patch(`/api/campaigns/${campaign._id}`).set('Authorization', `Bearer ${brandToken}`).send({ applicationDeadline: new Date(Date.now() + 40000000).toISOString() });
      expect(res.status).toBe(400);
    });

    it('allows later deadline', async () => {
      const res = await request(app).patch(`/api/campaigns/${campaign._id}`).set('Authorization', `Bearer ${brandToken}`).send({ applicationDeadline: new Date(Date.now() + 100000000).toISOString() });
      expect(res.status).toBe(200);
    });

    it('rejects cancelled campaign edit', async () => {
      await Campaign.findByIdAndUpdate(campaign._id, { status: CAMPAIGN_STATUS.CANCELLED });
      const res = await request(app).patch(`/api/campaigns/${campaign._id}`).set('Authorization', `Bearer ${brandToken}`).send({ title: 'New' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/campaigns/:id/cancel', () => {
    let campaign, app1, app2, creator2;
    beforeEach(async () => {
      creator2 = await User.create({ name: 'Creator 2', email: 'c2@c.com', passwordHash: 'h', role: 'creator' });
      campaign = await Campaign.create({
        brand: brand._id, title: 'Campaign 1', budgetPaise: 1000, perCreatorFeePaise: 100, slots: 5,
        applicationDeadline: new Date(Date.now() + 86400000), submissionDeadline: new Date(Date.now() + 172800000),
        status: CAMPAIGN_STATUS.ACTIVE, reservedPaise: 200, paidOutPaise: 0, approvedCount: 2
      });
      app1 = await Application.create({ campaign: campaign._id, creator: creator._id, feePaise: 100, status: APPLICATION_STATUS.APPROVED, statusHistory: [] });
      app2 = await Application.create({ campaign: campaign._id, creator: creator2._id, feePaise: 100, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
    });

    it('releases reservedPaise and updates apps', async () => {
      const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`).set('Authorization', `Bearer ${brandToken}`).send({ cancelReason: 'Test' });
      expect(res.status).toBe(200);
      
      const c = await Campaign.findById(campaign._id);
      expect(c.status).toBe(CAMPAIGN_STATUS.CANCELLED);
      expect(c.reservedPaise).toBe(100); // Wait, reservedPaise was 200, app1 is approved (100). So it releases 100.
      expect(c.approvedCount).toBe(1);

      const a1 = await Application.findById(app1._id);
      expect(a1.status).toBe(APPLICATION_STATUS.CANCELLED);
    });

    it('blocks if submission is submitted', async () => {
      await Submission.create({
        campaign: campaign._id,
        application: app1._id,
        creator: creator._id,
        brand: brand._id,
        postUrl: 'https://instagram.com/p/test123',
        status: SUBMISSION_STATUS.SUBMITTED
      });
      const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`).set('Authorization', `Bearer ${brandToken}`).send({ cancelReason: 'Test' });
      expect(res.status).toBe(409);
    });
  });
});
