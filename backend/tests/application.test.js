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
const Campaign = require('../models/Campaign');
const Application = require('../models/Application');
const Submission = require('../models/Submission');
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

const assertInvariants = async (campaignId) => {
  const c = await Campaign.findById(campaignId);
  expect(c.reservedPaise + c.paidOutPaise).toBeLessThanOrEqual(c.budgetPaise);
  expect(c.approvedCount).toBeGreaterThanOrEqual(0);
  expect(c.approvedCount).toBeLessThanOrEqual(c.slots);
};

describe('Application API', () => {
  let brand, brandToken, creator, creatorToken, campaign;
  
  beforeEach(async () => {
    brand = await User.create({ name: 'Brand', email: 'b@b.com', passwordHash: 'h', role: 'brand' });
    brandToken = generateToken(brand);
    creator = await User.create({ name: 'Creator', email: 'c@c.com', passwordHash: 'h', role: 'creator' });
    creatorToken = generateToken(creator);

    campaign = await Campaign.create({
      brand: brand._id,
      title: 'C1',
      budgetPaise: 10000,
      perCreatorFeePaise: 5000,
      slots: 2,
      applicationDeadline: new Date(Date.now() + 86400000), // tomorrow
      submissionDeadline: new Date(Date.now() + 172800000), // day after
      status: CAMPAIGN_STATUS.ACTIVE,
      reservedPaise: 0,
      paidOutPaise: 0,
      approvedCount: 0
    });
  });

  describe('Apply (Creator)', () => {
    it('creates application as creator', async () => {
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).set('Authorization', `Bearer ${creatorToken}`).send({ pitch: 'Hi' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe(APPLICATION_STATUS.APPLIED);
    });

    it('rejects brand', async () => {
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).set('Authorization', `Bearer ${brandToken}`).send({ pitch: 'Hi' });
      expect(res.status).toBe(403);
    });

    it('rejects missing token', async () => {
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).send({ pitch: 'Hi' });
      expect(res.status).toBe(401);
    });

    it('rejects duplicate apply', async () => {
      await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).set('Authorization', `Bearer ${creatorToken}`).send({ pitch: 'Hi2' });
      expect(res.status).toBe(409);
    });

    it('allows re-apply if withdrawn while applied', async () => {
      await Application.create({
        campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.WITHDRAWN,
        statusHistory: [{ from: null, to: APPLICATION_STATUS.APPLIED }, { from: APPLICATION_STATUS.APPLIED, to: APPLICATION_STATUS.WITHDRAWN }]
      });
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).set('Authorization', `Bearer ${creatorToken}`).send({ pitch: 'Hi2' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(APPLICATION_STATUS.APPLIED);
    });

    it('rejects re-apply if withdrawn while approved', async () => {
      await Application.create({
        campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.WITHDRAWN,
        statusHistory: [{ from: null, to: APPLICATION_STATUS.APPLIED }, { from: APPLICATION_STATUS.APPLIED, to: APPLICATION_STATUS.APPROVED }, { from: APPLICATION_STATUS.APPROVED, to: APPLICATION_STATUS.WITHDRAWN }]
      });
      const res = await request(app).post(`/api/campaigns/${campaign._id}/apply`).set('Authorization', `Bearer ${creatorToken}`).send({ pitch: 'Hi2' });
      expect(res.status).toBe(409);
    });
  });

  describe('Approve (Brand)', () => {
    let app1, app2, app3;
    beforeEach(async () => {
      const c2 = await User.create({ name: 'Creator2', email: 'c2@c.com', passwordHash: 'h', role: 'creator' });
      const c3 = await User.create({ name: 'Creator3', email: 'c3@c.com', passwordHash: 'h', role: 'creator' });
      app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      app2 = await Application.create({ campaign: campaign._id, creator: c2._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      app3 = await Application.create({ campaign: campaign._id, creator: c3._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
    });

    it('approves application and reserves money/slots', async () => {
      const res = await request(app).post(`/api/applications/${app1._id}/approve`).set('Authorization', `Bearer ${brandToken}`);
      expect(res.status).toBe(200);
      expect(res.body.application.status).toBe(APPLICATION_STATUS.APPROVED);
      expect(res.body.application.feePaise).toBe(5000);
      expect(res.body.campaign.reservedPaise).toBe(5000);
      expect(res.body.campaign.approvedCount).toBe(1);
      await assertInvariants(campaign._id);
    });

    it('handles race conditions for slots (2 slots, 5 applicants)', async () => {
      const c4 = await User.create({ name: 'Creator4', email: 'c4@c.com', passwordHash: 'h', role: 'creator' });
      const c5 = await User.create({ name: 'Creator5', email: 'c5@c.com', passwordHash: 'h', role: 'creator' });
      const app4 = await Application.create({ campaign: campaign._id, creator: c4._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      const app5 = await Application.create({ campaign: campaign._id, creator: c5._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });

      const promises = [app1, app2, app3, app4, app5].map(a => request(app).post(`/api/applications/${a._id}/approve`).set('Authorization', `Bearer ${brandToken}`));
      const results = await Promise.all(promises);
      
      const successCount = results.filter(r => r.status === 200).length;
      const conflictCount = results.filter(r => r.status === 409).length;
      
      expect(successCount).toBe(2);
      expect(conflictCount).toBe(3);
      
      const updatedCamp = await Campaign.findById(campaign._id);
      expect(updatedCamp.approvedCount).toBe(2);
      expect(updatedCamp.reservedPaise).toBe(10000);
      await assertInvariants(campaign._id);
    });

    it('handles race conditions for budget (budget allows 2, slots=5)', async () => {
      await Campaign.findByIdAndUpdate(campaign._id, { slots: 5 }); // 5 slots, but budget is 10000, fee 5000 -> max 2
      const promises = [app1, app2, app3].map(a => request(app).post(`/api/applications/${a._id}/approve`).set('Authorization', `Bearer ${brandToken}`));
      const results = await Promise.all(promises);
      
      const successCount = results.filter(r => r.status === 200).length;
      expect(successCount).toBe(2);
      
      const updatedCamp = await Campaign.findById(campaign._id);
      expect(updatedCamp.approvedCount).toBe(2);
      expect(updatedCamp.reservedPaise).toBe(10000);
      await assertInvariants(campaign._id);
    });
  });

  describe('Withdraw (Creator)', () => {
    it('withdraws applied app with no money changes', async () => {
      const app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      const res = await request(app).post(`/api/applications/${app1._id}/withdraw`).set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(200);
      
      const c = await Campaign.findById(campaign._id);
      expect(c.reservedPaise).toBe(0);
      expect(c.approvedCount).toBe(0);
    });

    it('withdraws approved app and releases money', async () => {
      const app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPROVED, feePaise: 5000, statusHistory: [] });
      await Campaign.findByIdAndUpdate(campaign._id, { reservedPaise: 5000, approvedCount: 1 });
      
      const res = await request(app).post(`/api/applications/${app1._id}/withdraw`).set('Authorization', `Bearer ${creatorToken}`);
      expect(res.status).toBe(200);
      
      const c = await Campaign.findById(campaign._id);
      expect(c.reservedPaise).toBe(0);
      expect(c.approvedCount).toBe(0);
    });
  });

  describe('Reject (Brand)', () => {
    it('rejects an applied application', async () => {
      const app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPLIED, statusHistory: [] });
      const res = await request(app).post(`/api/applications/${app1._id}/reject`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'No' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(APPLICATION_STATUS.REJECTED);
    });

    it('cannot reject an approved application', async () => {
      const app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPROVED, statusHistory: [] });
      const res = await request(app).post(`/api/applications/${app1._id}/reject`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'No' });
      expect(res.status).toBe(409);
    });
  });

  describe('Phase 3 integration: cancel campaign', () => {
    it('releases reserved funds from approved applications', async () => {
      const app1 = await Application.create({ campaign: campaign._id, creator: creator._id, status: APPLICATION_STATUS.APPROVED, feePaise: 5000, statusHistory: [] });
      const c2 = await User.create({ name: 'Creator2', email: 'c2@c.com', passwordHash: 'h', role: 'creator' });
      const app2 = await Application.create({ campaign: campaign._id, creator: c2._id, status: APPLICATION_STATUS.APPROVED, feePaise: 5000, statusHistory: [] });
      
      await Campaign.findByIdAndUpdate(campaign._id, { reservedPaise: 10000, approvedCount: 2 });

      const res = await request(app).post(`/api/campaigns/${campaign._id}/cancel`).set('Authorization', `Bearer ${brandToken}`).send({ cancelReason: 'Test' });
      expect(res.status).toBe(200);

      const c = await Campaign.findById(campaign._id);
      expect(c.status).toBe(CAMPAIGN_STATUS.CANCELLED);
      expect(c.reservedPaise).toBe(0);
      expect(c.approvedCount).toBe(0);

      const a1 = await Application.findById(app1._id);
      expect(a1.status).toBe(APPLICATION_STATUS.CANCELLED);
    });
  });
});
