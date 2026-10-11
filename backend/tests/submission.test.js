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
const { validateInstagramUrl } = require('../src/utils/instagram');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replSet.getUri();
  await mongoose.connect(mongoUri);
  await Submission.syncIndexes();
  await Application.syncIndexes();
  await Campaign.syncIndexes();
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
  expect(c.reservedPaise).toBeGreaterThanOrEqual(0);
};

describe('Phase 5: Submissions & Reviews', () => {
  let brand, brandToken, otherBrand, otherBrandToken;
  let creator, creatorToken, creator2, creator2Token;
  let campaign;

  beforeEach(async () => {
    brand = await User.create({ name: 'Brand User', email: 'brand@test.com', passwordHash: 'hash', role: 'brand' });
    brandToken = generateToken(brand);

    otherBrand = await User.create({ name: 'Other Brand', email: 'other@test.com', passwordHash: 'hash', role: 'brand' });
    otherBrandToken = generateToken(otherBrand);

    creator = await User.create({ name: 'Creator One', email: 'c1@test.com', passwordHash: 'hash', role: 'creator' });
    creatorToken = generateToken(creator);

    creator2 = await User.create({ name: 'Creator Two', email: 'c2@test.com', passwordHash: 'hash', role: 'creator' });
    creator2Token = generateToken(creator2);

    campaign = await Campaign.create({
      brand: brand._id,
      title: 'Summer Fashion 2026',
      budgetPaise: 20000,
      perCreatorFeePaise: 10000,
      slots: 2,
      applicationDeadline: new Date(Date.now() + 86400000), // tomorrow
      submissionDeadline: new Date(Date.now() + 172800000), // in 2 days
      status: CAMPAIGN_STATUS.ACTIVE,
      reservedPaise: 0,
      paidOutPaise: 0,
      approvedCount: 0
    });
  });

  describe('Instagram URL Validation Table Test', () => {
    const validCases = [
      { url: 'https://instagram.com/p/ABC123_', desc: 'post' },
      { url: 'https://www.instagram.com/reel/XYZ-789', desc: 'reel' },
      { url: 'https://instagram.com/reels/reelCode123', desc: 'reels' },
      { url: 'https://www.instagram.com/tv/TVCode123', desc: 'tv' },
      { url: 'https://www.instagram.com/fashion_blogger.99/p/POSTcode_1', desc: 'with username prefix' },
      { url: 'https://instagram.com/p/ABC123_/?utm_source=ig_web_copy_link#top', desc: 'with ?utm params and hash' }
    ];

    validCases.forEach(({ url, desc }) => {
      it(`validates successfully: ${desc} (${url})`, () => {
        const res = validateInstagramUrl(url);
        expect(res.isValid).toBe(true);
        expect(res.postUrl).not.toContain('?');
        expect(res.postUrl).not.toContain('#');
        expect(res.postUrlKey).toBeTruthy();
      });
    });

    const invalidCases = [
      { url: 'http://instagram.com/p/ABC123_', desc: 'http protocol' },
      { url: 'https://facebook.com/p/ABC123_', desc: 'facebook.com' },
      { url: 'https://instagram.com/username', desc: 'username only' },
      { url: 'https://instagram.com/p/', desc: 'missing code' },
      { url: 'javascript:alert(1)', desc: 'javascript: URL' },
      { url: 'https://instagram.com.evil.com/p/ABC123_', desc: 'instagram.com.evil.com' }
    ];

    invalidCases.forEach(({ url, desc }) => {
      it(`rejects invalid URL: ${desc}`, () => {
        const res = validateInstagramUrl(url);
        expect(res.isValid).toBe(false);
      });
    });
  });

  describe('Submit Deliverable (Creator)', () => {
    let approvedApp;

    beforeEach(async () => {
      // Create approved application for creator
      approvedApp = await Application.create({
        campaign: campaign._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 10000,
        submission: null,
        statusHistory: []
      });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { reservedPaise: 10000, approvedCount: 1 } });
    });

    it('approved creator submits a valid Instagram URL -> 201; URL is normalized', async () => {
      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          postUrl: 'https://www.instagram.com/p/Post123_/?utm_source=share#comments',
          note: 'Completed deliverable'
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(SUBMISSION_STATUS.SUBMITTED);
      expect(res.body.postUrl).toBe('https://www.instagram.com/p/Post123_');
      expect(res.body.postUrlKey).toBe('Post123_');
      expect(res.body.versions).toHaveLength(1);
      expect(res.body.versions[0].note).toBe('Completed deliverable');

      // Application has reference to submission
      const appDoc = await Application.findById(approvedApp._id);
      expect(appDoc.submission.toString()).toBe(res.body._id);
    });

    it('non-approved (applied/rejected/withdrawn) creator -> 409', async () => {
      const appliedApp = await Application.create({
        campaign: campaign._id,
        creator: creator2._id,
        status: APPLICATION_STATUS.APPLIED,
        statusHistory: []
      });

      const res = await request(app)
        .post(`/api/applications/${appliedApp._id}/submission`)
        .set('Authorization', `Bearer ${creator2Token}`)
        .send({ postUrl: 'https://instagram.com/p/Post123' });

      expect(res.status).toBe(409);
    });

    it('second submit -> 409', async () => {
      await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/Post123' });

      const res2 = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/Post123_other' });

      expect(res2.status).toBe(409);
    });

    it('submit after submissionDeadline -> 409', async () => {
      await Campaign.findByIdAndUpdate(campaign._id, { submissionDeadline: new Date(Date.now() - 10000) });

      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/Post123' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/deadline has passed/i);
    });

    it('submit to a cancelled campaign -> 409', async () => {
      await Campaign.findByIdAndUpdate(campaign._id, { status: CAMPAIGN_STATUS.CANCELLED });

      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/Post123' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not active/i);
    });

    it('brand tries to submit -> 403', async () => {
      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ postUrl: 'https://instagram.com/p/Post123' });

      expect(res.status).toBe(403);
    });

    it('two creators submitting the same post URL in one campaign -> second gets 409', async () => {
      const app2 = await Application.create({
        campaign: campaign._id,
        creator: creator2._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 10000,
        submission: null,
        statusHistory: []
      });

      const res1 = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/DuplicateKey123' });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/api/applications/${app2._id}/submission`)
        .set('Authorization', `Bearer ${creator2Token}`)
        .send({ postUrl: 'https://instagram.com/p/DuplicateKey123' });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/already submitted by another creator/i);
    });

    it('RACE TEST: creator fires withdraw and submit at the same time with Promise.all -> exactly one wins', async () => {
      for (let run = 0; run < 3; run++) {
        const testCreator = await User.create({ name: `Racer${run}`, email: `racer${run}@test.com`, passwordHash: 'h', role: 'creator' });
        const testToken = generateToken(testCreator);
        const testApp = await Application.create({
          campaign: campaign._id,
          creator: testCreator._id,
          status: APPLICATION_STATUS.APPROVED,
          feePaise: 10000,
          submission: null,
          statusHistory: []
        });
        await Campaign.findByIdAndUpdate(campaign._id, { $inc: { reservedPaise: 10000, approvedCount: 1 } });

        const [withdrawRes, submitRes] = await Promise.all([
          request(app).post(`/api/applications/${testApp._id}/withdraw`).set('Authorization', `Bearer ${testToken}`),
          request(app).post(`/api/applications/${testApp._id}/submission`).set('Authorization', `Bearer ${testToken}`).send({ postUrl: `https://instagram.com/p/RacePost_${run}` })
        ]);

        const statuses = [withdrawRes.status, submitRes.status];
        const has200 = statuses.includes(200);
        const has201 = statuses.includes(201);
        const has409 = statuses.includes(409);

        // Exactly one succeeded and one conflicted
        expect((has200 || has201) && has409).toBe(true);

        const finalApp = await Application.findById(testApp._id);
        const finalSub = await Submission.findOne({ application: testApp._id });

        if (finalApp.status === APPLICATION_STATUS.WITHDRAWN) {
          expect(finalSub).toBeNull();
          expect(finalApp.submission).toBeNull();
        } else {
          expect(finalApp.status).toBe(APPLICATION_STATUS.APPROVED);
          expect(finalSub).not.toBeNull();
          expect(finalApp.submission.toString()).toBe(finalSub._id.toString());
        }
      }
      await assertInvariants(campaign._id);
    });

    it('Withdraw (Phase 4) after submission exists -> 409', async () => {
      await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/CannotWithdrawPost' });

      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/withdraw`)
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already submitted work/i);
    });
  });

  describe('Review Deliverable (Brand)', () => {
    let approvedApp, submission;

    beforeEach(async () => {
      approvedApp = await Application.create({
        campaign: campaign._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 10000,
        submission: null,
        statusHistory: []
      });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { reservedPaise: 10000, approvedCount: 1 } });

      const subRes = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/ReviewMePost', note: 'Ready for review' });
      
      submission = subRes.body;
    });

    it('approve: submission approved, application completed, campaign reservedPaise decreases by fee and paidOutPaise increases by fee, approvedCount unchanged', async () => {
      const res = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Looks great!' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SUBMISSION_STATUS.APPROVED);
      expect(res.body.reviews).toHaveLength(1);
      expect(res.body.reviews[0].action).toBe('approved');

      const appDoc = await Application.findById(approvedApp._id);
      expect(appDoc.status).toBe(APPLICATION_STATUS.COMPLETED);

      const campDoc = await Campaign.findById(campaign._id);
      expect(campDoc.reservedPaise).toBe(0);
      expect(campDoc.paidOutPaise).toBe(10000);
      expect(campDoc.approvedCount).toBe(1);

      await assertInvariants(campaign._id);
    });

    it('RACE TEST: two approve requests at the same time on the same submission -> exactly one succeeds, paidOutPaise increased exactly once', async () => {
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/submissions/${submission._id}/approve`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'Approve 1' }),
        request(app).post(`/api/submissions/${submission._id}/approve`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'Approve 2' })
      ]);

      const successCount = [res1.status, res2.status].filter(s => s === 200).length;
      const conflictCount = [res1.status, res2.status].filter(s => s === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      const campDoc = await Campaign.findById(campaign._id);
      expect(campDoc.paidOutPaise).toBe(10000);
      expect(campDoc.reservedPaise).toBe(0);
      await assertInvariants(campaign._id);
    });

    it('RACE TEST: approve and reject at the same time on the same submission -> exactly one wins, money consistent', async () => {
      const [apprRes, rejRes] = await Promise.all([
        request(app).post(`/api/submissions/${submission._id}/approve`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'Approve' }),
        request(app).post(`/api/submissions/${submission._id}/reject`).set('Authorization', `Bearer ${brandToken}`).send({ note: 'Reject note min 5' })
      ]);

      const successCount = [apprRes.status, rejRes.status].filter(s => s === 200).length;
      const conflictCount = [apprRes.status, rejRes.status].filter(s => s === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(1);

      await assertInvariants(campaign._id);
    });

    it('request revision: revisionCount 1, status revision_requested, revisionDueAt is at least 48 hours away; note missing -> 400', async () => {
      // note missing
      const badRes = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({});
      expect(badRes.status).toBe(400);

      // short note
      const shortRes = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'abc' });
      expect(shortRes.status).toBe(400);

      const res = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Please tag the official handle in caption' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SUBMISSION_STATUS.REVISION_REQUESTED);
      expect(res.body.revisionCount).toBe(1);

      const dueDate = new Date(res.body.revisionDueAt).getTime();
      const minDue = Date.now() + 47 * 60 * 60 * 1000; // at least ~48 hours
      expect(dueDate).toBeGreaterThan(minDue);
    });

    it('revision limit: after 2 revisions a third revision request -> 409, but approve and reject still work', async () => {
      // Revision 1
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Revision 1 note' });

      // Resubmit 1
      await request(app)
        .put(`/api/submissions/${submission._id}/resubmit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/RevisedOnce' });

      // Revision 2
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Revision 2 note' });

      // Resubmit 2
      await request(app)
        .put(`/api/submissions/${submission._id}/resubmit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/RevisedTwice' });

      // 3rd revision request -> 409
      const thirdReq = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Third revision request' });

      expect(thirdReq.status).toBe(409);
      expect(thirdReq.body.message).toMatch(/Maximum 2 revisions/i);

      // But approve works!
      const approveRes = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Approved after 2 revisions' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe(SUBMISSION_STATUS.APPROVED);
    });

    it('resubmit: works only in revision_requested and before revisionDueAt; creates a new entry in versions; resubmit while status is submitted -> 409', async () => {
      // While status is submitted
      const badResubmit = await request(app)
        .put(`/api/submissions/${submission._id}/resubmit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/NewLink123' });
      expect(badResubmit.status).toBe(409);

      // Brand requests revision
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Fix post link' });

      // Now resubmit works
      const goodResubmit = await request(app)
        .put(`/api/submissions/${submission._id}/resubmit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/FixedLink123', note: 'Fixed the link' });
      expect(goodResubmit.status).toBe(200);
      expect(goodResubmit.body.status).toBe(SUBMISSION_STATUS.SUBMITTED);
      expect(goodResubmit.body.versions).toHaveLength(2);

      // If revisionDueAt was in past -> 409
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Need another fix' });

      await Submission.findByIdAndUpdate(submission._id, { revisionDueAt: new Date(Date.now() - 5000) });

      const expiredResubmit = await request(app)
        .put(`/api/submissions/${submission._id}/resubmit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/LateSubmission' });
      expect(expiredResubmit.status).toBe(409);
      expect(expiredResubmit.body.message).toMatch(/deadline has passed/i);
    });

    it('reject: submission rejected, application rejected, reservedPaise and approvedCount released, slotsLeft grows, creator cannot re-apply', async () => {
      // Missing note -> 400
      const missingNote = await request(app)
        .post(`/api/submissions/${submission._id}/reject`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({});
      expect(missingNote.status).toBe(400);

      const res = await request(app)
        .post(`/api/submissions/${submission._id}/reject`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Content does not meet guidelines' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(SUBMISSION_STATUS.REJECTED);

      const appDoc = await Application.findById(approvedApp._id);
      expect(appDoc.status).toBe(APPLICATION_STATUS.REJECTED);

      const campDoc = await Campaign.findById(campaign._id);
      expect(campDoc.reservedPaise).toBe(0);
      expect(campDoc.approvedCount).toBe(0);

      // Creator cannot re-apply (Phase 4 rule)
      const reapplyRes = await request(app)
        .post(`/api/campaigns/${campaign._id}/apply`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ pitch: 'Try again' });
      expect(reapplyRes.status).toBe(409);

      await assertInvariants(campaign._id);
    });

    it('Phase 4 rule still holds: POST /api/applications/:id/reject on an approved application -> 409', async () => {
      const res = await request(app)
        .post(`/api/applications/${approvedApp._id}/reject`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Direct reject' });

      expect(res.status).toBe(409);
    });

    it('a brand that does not own the campaign gets 404 on every review route; creator gets 403', async () => {
      // Other brand
      const bApprove = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${otherBrandToken}`)
        .send({});
      expect(bApprove.status).toBe(404);

      const bRev = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${otherBrandToken}`)
        .send({ note: 'Other brand revision note' });
      expect(bRev.status).toBe(404);

      const bRej = await request(app)
        .post(`/api/submissions/${submission._id}/reject`)
        .set('Authorization', `Bearer ${otherBrandToken}`)
        .send({ note: 'Other brand rejection note' });
      expect(bRej.status).toBe(404);

      // Creator gets 403
      const cApprove = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({});
      expect(cApprove.status).toBe(403);
    });

    it('reviewing a submission that is already approved/rejected -> 409', async () => {
      await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Approved' });

      const secondApprove = await request(app)
        .post(`/api/submissions/${submission._id}/approve`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({});
      expect(secondApprove.status).toBe(409);

      const revAfterApprove = await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Revise approved note' });
      expect(revAfterApprove.status).toBe(409);
    });
  });

  describe('Campaign Cancel Rules with Submissions', () => {
    let approvedApp, submission;

    beforeEach(async () => {
      approvedApp = await Application.create({
        campaign: campaign._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 10000,
        submission: null,
        statusHistory: []
      });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { reservedPaise: 10000, approvedCount: 1 } });

      const subRes = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/CancelTestPost' });
      submission = subRes.body;
    });

    it('cancel is blocked with a submitted submission', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/cancel`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ cancelReason: 'Emergency cancel' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/submissions need review/i);
    });

    it('cancel is blocked with a revision_requested submission whose revisionDueAt is in the future', async () => {
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Fix post please' });

      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/cancel`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ cancelReason: 'Emergency cancel' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/submissions need review/i);
    });

    it('cancel is allowed when revisionDueAt is in the past', async () => {
      await request(app)
        .post(`/api/submissions/${submission._id}/request-revision`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ note: 'Fix post please' });

      await Submission.findByIdAndUpdate(submission._id, { revisionDueAt: new Date(Date.now() - 10000) });

      const res = await request(app)
        .post(`/api/campaigns/${campaign._id}/cancel`)
        .set('Authorization', `Bearer ${brandToken}`)
        .send({ cancelReason: 'Creator went MIA' });

      expect(res.status).toBe(200);
      const camp = await Campaign.findById(campaign._id);
      expect(camp.status).toBe(CAMPAIGN_STATUS.CANCELLED);
    });
  });

  describe('List & Detail Endpoints', () => {
    let approvedApp, submission;

    beforeEach(async () => {
      approvedApp = await Application.create({
        campaign: campaign._id,
        creator: creator._id,
        status: APPLICATION_STATUS.APPROVED,
        feePaise: 10000,
        submission: null,
        statusHistory: []
      });
      await Campaign.findByIdAndUpdate(campaign._id, { $inc: { reservedPaise: 10000, approvedCount: 1 } });

      const subRes = await request(app)
        .post(`/api/applications/${approvedApp._id}/submission`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({ postUrl: 'https://instagram.com/p/ListDetailsPost', note: 'Check me out' });
      submission = subRes.body;
    });

    it('Creator GET /api/submissions/mine returns submissions with campaign and fee info', async () => {
      const res = await request(app)
        .get('/api/submissions/mine')
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const item = res.body[0];
      expect(item.campaign.title).toBe(campaign.title);
      expect(item.feePaise).toBe(10000);
      expect(item.status).toBe(SUBMISSION_STATUS.SUBMITTED);
      expect(item.revisionsLeft).toBe(2);
      expect(item.payoutBreakdown).toBeUndefined(); // Must not expose payoutBreakdown yet
    });

    it('Brand GET /api/campaigns/:id/submissions returns submissions list without creator email/phone', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${campaign._id}/submissions`)
        .set('Authorization', `Bearer ${brandToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      const item = res.body[0];
      expect(item.creator.name).toBe(creator.name);
      expect(item.creator.email).toBeUndefined();
      expect(item.creator.phone).toBeUndefined();
      expect(item.feePaise).toBe(10000);
    });

    it('GET /api/submissions/:id returns detail to owner or campaign brand, 404 to stranger', async () => {
      // Creator owner
      const resCreator = await request(app)
        .get(`/api/submissions/${submission._id}`)
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resCreator.status).toBe(200);
      expect(resCreator.body.postUrl).toBe('https://instagram.com/p/ListDetailsPost');

      // Campaign brand
      const resBrand = await request(app)
        .get(`/api/submissions/${submission._id}`)
        .set('Authorization', `Bearer ${brandToken}`);
      expect(resBrand.status).toBe(200);

      // Other brand -> 404
      const resOther = await request(app)
        .get(`/api/submissions/${submission._id}`)
        .set('Authorization', `Bearer ${otherBrandToken}`);
      expect(resOther.status).toBe(404);

      // Other creator -> 404
      const resOtherCreator = await request(app)
        .get(`/api/submissions/${submission._id}`)
        .set('Authorization', `Bearer ${creator2Token}`);
      expect(resOtherCreator.status).toBe(404);

      // Invalid ID -> 404
      const resInvalid = await request(app)
        .get('/api/submissions/invalidId123')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(resInvalid.status).toBe(404);
    });

    it('Brand summary has real pendingReviewCount and campaign list has pendingReviewCount', async () => {
      const summaryRes = await request(app)
        .get('/api/campaigns/mine/summary')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.pendingReviewCount).toBe(1);

      const listRes = await request(app)
        .get('/api/campaigns/mine')
        .set('Authorization', `Bearer ${brandToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body[0].pendingReviewCount).toBe(1);
    });

    it('Creator GET /api/campaigns/:id and applications/mine include submission data', async () => {
      const campRes = await request(app)
        .get(`/api/campaigns/${campaign._id}`)
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(campRes.status).toBe(200);
      expect(campRes.body.myApplication).toBeTruthy();
      expect(campRes.body.myApplication.submission).toBeTruthy();
      expect(campRes.body.myApplication.submission.status).toBe(SUBMISSION_STATUS.SUBMITTED);

      const appsRes = await request(app)
        .get('/api/applications/mine')
        .set('Authorization', `Bearer ${creatorToken}`);
      expect(appsRes.status).toBe(200);
      expect(appsRes.body[0].submission).toBeTruthy();
      expect(appsRes.body[0].submission.status).toBe(SUBMISSION_STATUS.SUBMITTED);
      expect(appsRes.body[0].canWithdraw).toBe(false);
    });
  });
});
