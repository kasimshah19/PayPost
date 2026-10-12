const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const ioClient = require('socket.io-client');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/env', () => ({
  PORT: 5000,
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'testsecret_realtime',
  CLIENT_URL: 'http://localhost:5173',
  REALTIME_ENABLED: true
}));

const env = require('../src/config/env');
const app = require('../src/app');
const User = require('../src/models/User');
const Campaign = require('../src/models/Campaign');
const Application = require('../src/models/Application');
const Submission = require('../src/models/Submission');
const Wallet = require('../src/models/Wallet');
const Withdrawal = require('../src/models/Withdrawal');
const NotificationJob = require('../src/models/NotificationJob');
const { CAMPAIGN_STATUS, APPLICATION_STATUS, SUBMISSION_STATUS } = require('../src/constants');
const { generateToken } = require('../src/utils/jwt');
const { initRealtime, closeRealtime, afterCommit, clearAfterCommit, flushAfterCommit, getIO, emitToUser, emitToRole } = require('../src/realtime');
const { ALLOWED_KEYS, EVENTS, buildPayload } = require('../src/realtime/events');
const withTransaction = require('../src/utils/withTransaction');
const applicationService = require('../src/services/application.service');
const campaignService = require('../src/services/campaign.service');
const submissionService = require('../src/services/submissionService');
const withdrawalService = require('../src/services/withdrawalService');
const { processWithdrawalsOnce } = require('../src/jobs/withdrawalWorker');
const { processNotificationsOnce } = require('../src/jobs/notificationWorker');

let replSet;
let server;
let serverPort;
let serverUrl;

// Helper: wait for specific event
function waitForEvent(socket, eventName, timeoutMs = 2500, predicate = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(data) {
      if (predicate && !predicate(data)) {
        return;
      }
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve(data);
    }

    socket.on(eventName, listener);
  });
}

// Helper: expect NO event within timeout
function expectNoEvent(socket, eventName, timeoutMs = 300) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      resolve();
    }, timeoutMs);

    function listener(data) {
      clearTimeout(timer);
      socket.off(eventName, listener);
      reject(new Error(`Unexpectedly received event "${eventName}" with data: ${JSON.stringify(data)}`));
    }

    socket.on(eventName, listener);
  });
}

// Helper: connect client socket
function connectSocket(token, options = {}) {
  return new Promise((resolve, reject) => {
    const client = ioClient(serverUrl, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
      ...options
    });

    client.on('connect', () => {
      resolve(client);
    });

    client.on('connect_error', (err) => {
      resolve({ error: err.message, client });
    });
  });
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());

  server = http.createServer(app);
  initRealtime(server);

  await new Promise((resolve) => {
    server.listen(0, () => {
      serverPort = server.address().port;
      serverUrl = `http://localhost:${serverPort}`;
      resolve();
    });
  });
});

afterAll(async () => {
  closeRealtime();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await Campaign.deleteMany({});
  await Application.deleteMany({});
  await Submission.deleteMany({});
  await Wallet.deleteMany({});
  await Withdrawal.deleteMany({});
  await NotificationJob.deleteMany({});
});

describe('Realtime Socket.IO Backend', () => {
  let brandUser, brandToken;
  let creatorUser, creatorToken;

  beforeEach(async () => {
    brandUser = await User.create({
      name: 'Test Brand',
      email: 'brand@test.com',
      passwordHash: 'hash',
      role: 'brand'
    });
    brandToken = generateToken(brandUser);

    creatorUser = await User.create({
      name: 'Test Creator',
      email: 'creator@test.com',
      passwordHash: 'hash',
      role: 'creator'
    });
    creatorToken = generateToken(creatorUser);
  });

  // 1. AUTHENTICATION
  describe('Authentication & Connection Limits', () => {
    test('rejects connection when token is missing', async () => {
      const res = await connectSocket(null);
      expect(res.error).toMatch(/Unauthorized/i);
      if (res.client) res.client.disconnect();
    });

    test('rejects connection when token is garbage', async () => {
      const res = await connectSocket('invalid-garbage-token');
      expect(res.error).toMatch(/Unauthorized/i);
      if (res.client) res.client.disconnect();
    });

    test('rejects connection when token is expired', async () => {
      const expiredToken = jwt.sign(
        { id: creatorUser._id, role: 'creator' },
        env.JWT_SECRET,
        { expiresIn: '-10s' }
      );
      const res = await connectSocket(expiredToken);
      expect(res.error).toMatch(/Unauthorized/i);
      if (res.client) res.client.disconnect();
    });

    test('rejects connection when user no longer exists in DB', async () => {
      const ghostId = new mongoose.Types.ObjectId();
      const ghostToken = jwt.sign(
        { id: ghostId, role: 'creator' },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const res = await connectSocket(ghostToken);
      expect(res.error).toMatch(/Unauthorized/i);
      if (res.client) res.client.disconnect();
    });

    test('does NOT accept token from query string', async () => {
      const res = await connectSocket(null, {
        query: { token: creatorToken }
      });
      expect(res.error).toMatch(/Unauthorized/i);
      if (res.client) res.client.disconnect();
    });

    test('connects successfully with valid token in auth header', async () => {
      const client = await connectSocket(creatorToken);
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    test('disconnects the oldest socket when 6th socket is opened for same user', async () => {
      const sockets = [];
      for (let i = 0; i < 5; i++) {
        const s = await connectSocket(creatorToken);
        expect(s.connected).toBe(true);
        sockets.push(s);
      }

      // Track disconnect of first socket
      let firstDisconnected = false;
      sockets[0].on('disconnect', () => {
        firstDisconnected = true;
      });

      // 6th connection
      const sixth = await connectSocket(creatorToken);
      expect(sixth.connected).toBe(true);
      sockets.push(sixth);

      // Give 50ms for server to disconnect the oldest
      await new Promise(r => setTimeout(r, 80));
      expect(firstDisconnected).toBe(true);

      // Clean up
      sockets.forEach(s => s.disconnect());
    });
  });

  // 2. ROOMS & PRIVACY
  describe('Rooms & Privacy Isolation', () => {
    let brand2, brand2Token;
    let creator2, creator2Token;

    beforeEach(async () => {
      brand2 = await User.create({ name: 'Brand 2', email: 'brand2@test.com', passwordHash: 'h', role: 'brand' });
      brand2Token = generateToken(brand2);

      creator2 = await User.create({ name: 'Creator 2', email: 'creator2@test.com', passwordHash: 'h', role: 'creator' });
      creator2Token = generateToken(creator2);
    });

    test('Brand A does not receive Brand B events', async () => {
      const sBrand1 = await connectSocket(brandToken);
      const sBrand2 = await connectSocket(brand2Token);

      emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
        campaignId: 'camp-123',
        status: 'active',
        reason: 'edited',
        showToast: false
      });

      const p1 = waitForEvent(sBrand1, EVENTS.CAMPAIGN_CHANGED);
      const p2 = expectNoEvent(sBrand2, EVENTS.CAMPAIGN_CHANGED);

      const [data1] = await Promise.all([p1, p2]);
      expect(data1.campaignId).toBe('camp-123');

      sBrand1.disconnect();
      sBrand2.disconnect();
    });

    test('Creator B does not receive Creator A events', async () => {
      const sCreator1 = await connectSocket(creatorToken);
      const sCreator2 = await connectSocket(creator2Token);

      emitToUser(creatorUser._id, EVENTS.APPLICATION_CHANGED, {
        applicationId: 'app-1',
        status: 'approved',
        showToast: true
      });

      const p1 = waitForEvent(sCreator1, EVENTS.APPLICATION_CHANGED);
      const p2 = expectNoEvent(sCreator2, EVENTS.APPLICATION_CHANGED);

      const [data1] = await Promise.all([p1, p2]);
      expect(data1.applicationId).toBe('app-1');

      sCreator1.disconnect();
      sCreator2.disconnect();
    });

    test('discover:changed reaches creators room but NOT brands room', async () => {
      const sCreator = await connectSocket(creatorToken);
      const sBrand = await connectSocket(brandToken);

      emitToRole('creator', EVENTS.DISCOVER_CHANGED, {
        campaignId: 'camp-new'
      });

      const pCreator = waitForEvent(sCreator, EVENTS.DISCOVER_CHANGED);
      const pBrand = expectNoEvent(sBrand, EVENTS.DISCOVER_CHANGED);

      const [data] = await Promise.all([pCreator, pBrand]);
      expect(data.campaignId).toBe('camp-new');

      sCreator.disconnect();
      sBrand.disconnect();
    });

    test('client emitting "join" or room hijack events gets nothing and ignores client emits', async () => {
      const sCreator2 = await connectSocket(creator2Token);

      // Attempt to join creator 1's room from client
      sCreator2.emit('join', `user:${creatorUser._id}`);
      sCreator2.emit('subscribe', `user:${creatorUser._id}`);

      // Emit event strictly to Creator 1
      emitToUser(creatorUser._id, EVENTS.WALLET_CHANGED, {
        reason: 'payout_credited',
        amountPaise: 50000,
        showToast: true
      });

      // Creator 2 must NOT receive it
      await expectNoEvent(sCreator2, EVENTS.WALLET_CHANGED);

      sCreator2.disconnect();
    });
  });

  // 3. ALLOWLIST & PRIVACY LEAK PREVENTION
  describe('Payload Allowlist Verification (R5)', () => {
    test('buildPayload drops all non-whitelisted sensitive keys', () => {
      const dirty = {
        type: EVENTS.APPLICATION_CHANGED,
        at: new Date().toISOString(),
        campaignId: 'c1',
        campaignTitle: 'Nike Shoes',
        applicationId: 'a1',
        status: 'applied',
        showToast: true,
        // Sensitive data that must NEVER pass:
        budgetPaise: 500000,
        reservedPaise: 200000,
        paidOutPaise: 100000,
        email: 'secret@brand.com',
        phone: '+919876543210',
        upi: 'brand@upi',
        pitch: 'My secret creator pitch',
        note: 'Brand internal notes',
        postUrl: 'https://instagram.com/p/test'
      };

      const clean = buildPayload(EVENTS.APPLICATION_CHANGED, dirty);
      const cleanKeys = Object.keys(clean);

      // Verify each key in clean output is in ALLOWED_KEYS
      for (const k of cleanKeys) {
        expect(ALLOWED_KEYS).toContain(k);
      }

      expect(clean.budgetPaise).toBeUndefined();
      expect(clean.reservedPaise).toBeUndefined();
      expect(clean.paidOutPaise).toBeUndefined();
      expect(clean.email).toBeUndefined();
      expect(clean.phone).toBeUndefined();
      expect(clean.upi).toBeUndefined();
      expect(clean.pitch).toBeUndefined();
      expect(clean.note).toBeUndefined();
      expect(clean.postUrl).toBeUndefined();
      expect(clean.campaignId).toBe('c1');
      expect(clean.campaignTitle).toBe('Nike Shoes');
    });

    test('captured payload across socket only has allowed keys', async () => {
      const sBrand = await connectSocket(brandToken);

      emitToUser(brandUser._id, EVENTS.APPLICATION_CHANGED, {
        type: EVENTS.APPLICATION_CHANGED,
        campaignId: 'c99',
        campaignTitle: 'Super Title',
        applicationId: 'a99',
        status: 'applied',
        showToast: true,
        pitch: 'sensitive pitch should be removed',
        email: 'leaked@test.com'
      });

      const payload = await waitForEvent(sBrand, EVENTS.APPLICATION_CHANGED);
      const keys = Object.keys(payload);
      for (const k of keys) {
        expect(ALLOWED_KEYS).toContain(k);
      }
      expect(payload.pitch).toBeUndefined();
      expect(payload.email).toBeUndefined();

      sBrand.disconnect();
    });
  });

  // 4. AFTER COMMIT & TRANSACTION SAFETY (R2)
  describe('Transaction Safety & afterCommit', () => {
    test('transaction rollback emits NOTHING', async () => {
      const sBrand = await connectSocket(brandToken);

      try {
        await withTransaction(async (session) => {
          afterCommit(session, () => {
            emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
              campaignId: 'c-rolledback',
              status: 'active',
              reason: 'created',
              showToast: true
            });
          });

          // Simulate error forcing rollback
          throw new Error('Forced Rollback Error');
        });
      } catch (err) {
        expect(err.message).toBe('Forced Rollback Error');
      }

      await expectNoEvent(sBrand, EVENTS.CAMPAIGN_CHANGED);
      sBrand.disconnect();
    });

    test('successful transaction emits exactly once', async () => {
      const sBrand = await connectSocket(brandToken);
      let emittedCount = 0;
      sBrand.on(EVENTS.CAMPAIGN_CHANGED, () => {
        emittedCount++;
      });

      await withTransaction(async (session) => {
        afterCommit(session, () => {
          emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
            campaignId: 'c-success',
            status: 'active',
            reason: 'created',
            showToast: true
          });
        });
      });

      await new Promise(r => setTimeout(r, 100));
      expect(emittedCount).toBe(1);
      sBrand.disconnect();
    });

    test('unit-test retry simulation: running callback twice flushes only once for final attempt', async () => {
      const sBrand = await connectSocket(brandToken);
      let receivedEvents = [];
      sBrand.on(EVENTS.CAMPAIGN_CHANGED, (d) => {
        receivedEvents.push(d);
      });

      const mockSession = {};
      // Attempt 1: queues event, then errors out
      clearAfterCommit(mockSession);
      afterCommit(mockSession, () => {
        emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
          campaignId: 'c-attempt-1',
          status: 'active',
          reason: 'created',
          showToast: true
        });
      });

      // Attempt 2 (retry): clears prior attempt, queues final event, commits and flushes
      clearAfterCommit(mockSession);
      afterCommit(mockSession, () => {
        emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
          campaignId: 'c-attempt-2',
          status: 'active',
          reason: 'created',
          showToast: true
        });
      });
      flushAfterCommit(mockSession);

      await new Promise(r => setTimeout(r, 100));
      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].campaignId).toBe('c-attempt-2');

      sBrand.disconnect();
    });
  });

  // 5. ROBUSTNESS (R3)
  describe('Robustness & Non-blocking Behavior', () => {
    test('if socket emit throws, REST action still succeeds', async () => {
      const io = getIO();
      const originalTo = io.to;

      // Mock io.to to throw
      io.to = () => {
        throw new Error('Socket IO Exploded');
      };

      try {
        // Calling emitToUser should not throw
        expect(() => {
          emitToUser(brandUser._id, EVENTS.CAMPAIGN_CHANGED, {
            campaignId: 'c-1',
            status: 'active',
            reason: 'created',
            showToast: false
          });
        }).not.toThrow();
      } finally {
        io.to = originalTo;
      }
    });
  });

  // 6. BUSINESS FLOWS
  describe('End-to-End Realtime Business Flows', () => {
    let campaign;

    beforeEach(async () => {
      campaign = await Campaign.create({
        brand: brandUser._id,
        title: 'Sneaker Campaign',
        description: 'Promote our shoes',
        budgetPaise: 50000,
        perCreatorFeePaise: 25000,
        slots: 2,
        applicationDeadline: new Date(Date.now() + 86400000 * 5),
        submissionDeadline: new Date(Date.now() + 86400000 * 10),
        status: CAMPAIGN_STATUS.ACTIVE,
        reservedPaise: 0,
        paidOutPaise: 0,
        approvedCount: 0
      });
    });

    test('Apply: Brand gets application:changed (toast true), applicant gets silent copy', async () => {
      const sBrand = await connectSocket(brandToken);
      const sCreator = await connectSocket(creatorToken);

      const pBrand = waitForEvent(sBrand, EVENTS.APPLICATION_CHANGED);
      const pCreator = waitForEvent(sCreator, EVENTS.APPLICATION_CHANGED);

      await applicationService.applyToCampaign(campaign._id, creatorUser._id, 'I love shoes');

      const [brandPayload, creatorPayload] = await Promise.all([pBrand, pCreator]);

      expect(brandPayload.status).toBe('applied');
      expect(brandPayload.showToast).toBe(true);

      expect(creatorPayload.status).toBe('applied');
      expect(creatorPayload.showToast).toBe(false);

      sBrand.disconnect();
      sCreator.disconnect();
    });

    test('Approve: Creator gets application:changed (toast true) + campaign:changed(money) to brand + discover:changed to creators', async () => {
      const appDoc = await applicationService.applyToCampaign(campaign._id, creatorUser._id, 'Hey');

      const sBrand = await connectSocket(brandToken);
      const sCreator = await connectSocket(creatorToken);

      const pAppChange = waitForEvent(sCreator, EVENTS.APPLICATION_CHANGED);
      const pCampChange = waitForEvent(sBrand, EVENTS.CAMPAIGN_CHANGED);
      const pDiscover = waitForEvent(sCreator, EVENTS.DISCOVER_CHANGED);

      await applicationService.approveApplication(appDoc._id, brandUser._id);

      const [appData, campData, discData] = await Promise.all([pAppChange, pCampChange, pDiscover]);

      expect(appData.status).toBe('approved');
      expect(appData.showToast).toBe(true);

      expect(campData.reason).toBe('money');
      expect(campData.showToast).toBe(false);

      expect(discData.campaignId).toBe(campaign._id.toString());

      sBrand.disconnect();
      sCreator.disconnect();
    });

    test('Submit, Revision, Resubmit, Approve deliverable cycle', async () => {
      const appDoc = await applicationService.applyToCampaign(campaign._id, creatorUser._id, 'Hey');
      await applicationService.approveApplication(appDoc._id, brandUser._id);

      const sBrand = await connectSocket(brandToken);
      const sCreator = await connectSocket(creatorToken);

      // 1. Submit
      const pSubmitBrand = waitForEvent(sBrand, EVENTS.SUBMISSION_CHANGED);
      const pSubmitCreator = waitForEvent(sCreator, EVENTS.SUBMISSION_CHANGED);

      const subDoc = await submissionService.submitDeliverable(appDoc._id, creatorUser._id, {
        postUrl: 'https://instagram.com/p/TEST_123',
        note: 'Here is my post'
      });

      const [bSub, cSub] = await Promise.all([pSubmitBrand, pSubmitCreator]);
      expect(bSub.status).toBe('submitted');
      expect(bSub.showToast).toBe(true);
      expect(cSub.status).toBe('submitted');
      expect(cSub.showToast).toBe(false);

      // 2. Request Revision
      const pRevCreator = waitForEvent(sCreator, EVENTS.SUBMISSION_CHANGED);
      const pRevBrand = waitForEvent(sBrand, EVENTS.SUBMISSION_CHANGED);

      await submissionService.requestRevision(subDoc._id, brandUser._id, {
        note: 'Please include the product hashtag'
      });

      const [cRev, bRev] = await Promise.all([pRevCreator, pRevBrand]);
      expect(cRev.status).toBe('revision_requested');
      expect(cRev.showToast).toBe(true);
      expect(bRev.status).toBe('revision_requested');
      expect(bRev.showToast).toBe(false);

      // 3. Resubmit
      const pResubBrand = waitForEvent(sBrand, EVENTS.SUBMISSION_CHANGED);
      const pResubCreator = waitForEvent(sCreator, EVENTS.SUBMISSION_CHANGED);

      await submissionService.resubmitDeliverable(subDoc._id, creatorUser._id, {
        postUrl: 'https://instagram.com/p/TEST_123_REV',
        note: 'Added the hashtags'
      });

      const [bResub, cResub] = await Promise.all([pResubBrand, pResubCreator]);
      expect(bResub.status).toBe('resubmitted');
      expect(bResub.showToast).toBe(true);
      expect(cResub.status).toBe('resubmitted');
      expect(cResub.showToast).toBe(false);

      // 4. Approve Submission + Payout
      const pApproveSubCreator = waitForEvent(sCreator, EVENTS.SUBMISSION_CHANGED);
      const pApproveSubBrand = waitForEvent(sBrand, EVENTS.SUBMISSION_CHANGED);
      const pWalletPayout = waitForEvent(sCreator, EVENTS.WALLET_CHANGED);
      const pNotifPayout = waitForEvent(sCreator, EVENTS.NOTIFICATION_CHANGED);

      await submissionService.approveSubmission(subDoc._id, brandUser._id, {
        note: 'Looks great!'
      });

      const [cApprove, bApprove, cWallet, cNotif] = await Promise.all([
        pApproveSubCreator,
        pApproveSubBrand,
        pWalletPayout,
        pNotifPayout
      ]);

      expect(cApprove.status).toBe('approved');
      expect(cApprove.showToast).toBe(true);
      expect(bApprove.status).toBe('approved');
      expect(bApprove.showToast).toBe(false);

      // Payout credited with net amountPaise
      expect(cWallet.reason).toBe('payout_credited');
      expect(cWallet.amountPaise).toBeGreaterThan(0);
      expect(cWallet.showToast).toBe(true);
      expect(cNotif.status).toBe('pending');

      sBrand.disconnect();
      sCreator.disconnect();
    });

    test('Withdrawal request and processWithdrawalsOnce (success & failure)', async () => {
      const sCreator = await connectSocket(creatorToken);

      // Seed wallet balance
      await Wallet.create({
        user: creatorUser._id,
        balancePaise: 100000,
        heldPaise: 0
      });

      // 1. Withdrawal request
      const pWalletHold = waitForEvent(sCreator, EVENTS.WALLET_CHANGED);
      const pWithPending = waitForEvent(sCreator, EVENTS.WITHDRAWAL_CHANGED);

      const withRes = await withdrawalService.requestWithdrawal({
        userId: creatorUser._id,
        amountPaise: 50000,
        upiId: 'creator@okbank',
        clientKey: 'req-1'
      });

      const [wHold, wPending] = await Promise.all([pWalletHold, pWithPending]);
      expect(wHold.reason).toBe('withdrawal_hold');
      expect(wHold.showToast).toBe(false);
      expect(wPending.status).toBe('pending');
      expect(wPending.showToast).toBe(false);

      // 2. Process withdrawal (success case)
      const pWithSucceeded = waitForEvent(sCreator, EVENTS.WITHDRAWAL_CHANGED, 2500, d => d.status === 'succeeded');
      const pWalletSucceeded = waitForEvent(sCreator, EVENTS.WALLET_CHANGED);

      await processWithdrawalsOnce();

      const [wSucceeded, wWalSuccess] = await Promise.all([pWithSucceeded, pWalletSucceeded]);
      expect(wSucceeded.status).toBe('succeeded');
      expect(wSucceeded.showToast).toBe(true);
      expect(wWalSuccess.reason).toBe('withdrawal_succeeded');
      expect(wWalSuccess.amountPaise).toBe(50000);
      expect(wWalSuccess.showToast).toBe(true);

      // 3. New withdrawal that fails (mock provider returns failure for fail@mock)
      const pFailHold = waitForEvent(sCreator, EVENTS.WALLET_CHANGED);
      await withdrawalService.requestWithdrawal({
        userId: creatorUser._id,
        amountPaise: 20000,
        upiId: 'fail@mock',
        clientKey: 'req-2'
      });
      await pFailHold;

      const pWithFailed = waitForEvent(sCreator, EVENTS.WITHDRAWAL_CHANGED, 2500, d => d.status === 'failed');
      const pWalletReversed = waitForEvent(sCreator, EVENTS.WALLET_CHANGED);

      await processWithdrawalsOnce();

      const [wFailed, wReversed] = await Promise.all([pWithFailed, pWalletReversed]);
      expect(wFailed.status).toBe('failed');
      expect(wFailed.showToast).toBe(true);
      expect(wReversed.reason).toBe('withdrawal_reversed');
      expect(wReversed.amountPaise).toBe(20000);
      expect(wReversed.showToast).toBe(true);

      sCreator.disconnect();
    });

    test('Campaign cancel with 2 approved creators: exactly those 2 creators get application:changed(cancelled) & campaign:changed(cancelled)', async () => {
      const creator2 = await User.create({ name: 'Creator 2', email: 'c2@test.com', passwordHash: 'h', role: 'creator' });
      const creator3 = await User.create({ name: 'Creator 3', email: 'c3@test.com', passwordHash: 'h', role: 'creator' });
      const creator2Token = generateToken(creator2);
      const creator3Token = generateToken(creator3);

      const app1 = await applicationService.applyToCampaign(campaign._id, creatorUser._id, 'App 1');
      const app2 = await applicationService.applyToCampaign(campaign._id, creator2._id, 'App 2');
      await applicationService.approveApplication(app1._id, brandUser._id);
      await applicationService.approveApplication(app2._id, brandUser._id);

      const sC1 = await connectSocket(creatorToken);
      const sC2 = await connectSocket(creator2Token);
      const sC3 = await connectSocket(creator3Token);
      const sBrand = await connectSocket(brandToken);

      const pC1App = waitForEvent(sC1, EVENTS.APPLICATION_CHANGED);
      const pC1Camp = waitForEvent(sC1, EVENTS.CAMPAIGN_CHANGED);

      const pC2App = waitForEvent(sC2, EVENTS.APPLICATION_CHANGED);
      const pC2Camp = waitForEvent(sC2, EVENTS.CAMPAIGN_CHANGED);

      const pC3App = expectNoEvent(sC3, EVENTS.APPLICATION_CHANGED);
      const pC3Camp = expectNoEvent(sC3, EVENTS.CAMPAIGN_CHANGED);

      const pBrandCamp = waitForEvent(sBrand, EVENTS.CAMPAIGN_CHANGED);

      await campaignService.cancel(campaign._id, 'Brand changed mind', brandUser._id);

      const [c1App, c1Camp, c2App, c2Camp, brandCamp] = await Promise.all([
        pC1App, pC1Camp, pC2App, pC2Camp, pBrandCamp, pC3App, pC3Camp
      ]);

      expect(c1App.status).toBe('cancelled');
      expect(c1App.showToast).toBe(true);
      expect(c1Camp.reason).toBe('cancelled');
      expect(c1Camp.showToast).toBe(true);

      expect(c2App.status).toBe('cancelled');
      expect(c2App.showToast).toBe(true);
      expect(c2Camp.reason).toBe('cancelled');
      expect(c2Camp.showToast).toBe(true);

      expect(brandCamp.reason).toBe('cancelled');
      expect(brandCamp.showToast).toBe(false);

      sC1.disconnect();
      sC2.disconnect();
      sC3.disconnect();
      sBrand.disconnect();
    });
  });
});
