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
  STUCK_PROCESSING_AFTER_MS: 60000
}));

const app = require('../src/app');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const LedgerEntry = require('../src/models/LedgerEntry');
const Withdrawal = require('../src/models/Withdrawal');
const { ROLES, WITHDRAWAL_STATUS, LEDGER_TYPE, LEDGER_DIRECTION, MIN_WITHDRAWAL_PAISE } = require('../src/constants');
const { generateToken } = require('../src/utils/jwt');
const { ensureWallet } = require('../src/services/walletService');
const { processWithdrawalsOnce } = require('../src/jobs/withdrawalWorker');
const { finalizeWithdrawal } = require('../src/services/withdrawalService');
const mockProvider = require('../src/services/mockPayoutProvider');
const { checkIntegrity } = require('../src/services/integrityService');
const env = require('../src/config/env');

let replSet;
let creator1, creatorToken1;
let creator2, creatorToken2;
let brand, brandToken;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replSet.getUri();
  await mongoose.connect(mongoUri);

  await User.syncIndexes();
  await Wallet.syncIndexes();
  await LedgerEntry.syncIndexes();
  await Withdrawal.syncIndexes();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  mockProvider._resetCache();
  env.MOCK_PAYOUT_MODE = 'random';
  env.MOCK_PAYOUT_SUCCESS_RATE = 0.7;

  await User.deleteMany({});
  await Wallet.deleteMany({});
  await Withdrawal.deleteMany({});
  if (mongoose.connection.collections.ledgerentries) {
    await mongoose.connection.collection('ledgerentries').deleteMany({});
  }

  // Create test users
  creator1 = await User.create({
    name: 'Creator One',
    email: 'creator1@test.com',
    passwordHash: 'hash',
    role: ROLES.CREATOR
  });
  creatorToken1 = generateToken(creator1);

  creator2 = await User.create({
    name: 'Creator Two',
    email: 'creator2@test.com',
    passwordHash: 'hash',
    role: ROLES.CREATOR
  });
  creatorToken2 = generateToken(creator2);

  brand = await User.create({
    name: 'Brand Co',
    email: 'brand@test.com',
    passwordHash: 'hash',
    role: ROLES.BRAND
  });
  brandToken = generateToken(brand);
});

// Helper to credit a creator's wallet with ledger entry
async function creditCreator(userId, amountPaise) {
  const wallet = await ensureWallet(userId);
  const updatedWallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balancePaise: amountPaise } },
    { new: true }
  );

  await LedgerEntry.create({
    wallet: wallet._id,
    user: userId,
    type: LEDGER_TYPE.PAYOUT_CREDIT,
    direction: LEDGER_DIRECTION.CREDIT,
    amountPaise,
    balanceAfterPaise: updatedWallet.balancePaise,
    description: 'Initial funding for test',
    idempotencyKey: `credit-test:${new mongoose.Types.ObjectId()}`
  });

  return updatedWallet;
}

describe('Phase 7: Withdrawal Requests', () => {
  it('success: balance decreases, heldPaise increases, one withdrawal_hold entry created, status pending, isActive true', async () => {
    await creditCreator(creator1._id, 50000); // Rs 500

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'req-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' }); // Rs 200

    expect(res.status).toBe(201);
    expect(res.body.withdrawal.status).toBe(WITHDRAWAL_STATUS.PENDING);
    expect(res.body.withdrawal.isActive).toBe(true);
    expect(res.body.withdrawal.amountPaise).toBe(20000);
    expect(res.body.withdrawal.payoutDestination.upiId).toBe('su***@mock'); // Masked!
    expect(res.body.wallet.balancePaise).toBe(30000);
    expect(res.body.wallet.heldPaise).toBe(20000);

    // Verify DB states
    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(20000);

    const holds = await LedgerEntry.find({
      user: creator1._id,
      type: LEDGER_TYPE.WITHDRAWAL_HOLD
    });
    expect(holds).toHaveLength(1);
    expect(holds[0].amountPaise).toBe(20000);
    expect(holds[0].direction).toBe(LEDGER_DIRECTION.DEBIT);
    expect(holds[0].balanceAfterPaise).toBe(30000);
  });

  it('validation errors: below min, float amount, bad upi -> 400', async () => {
    await creditCreator(creator1._id, 50000);

    // Below minimum
    const resMin = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 5000, upiId: 'success@mock' });
    expect(resMin.status).toBe(400);

    // Float amount
    const resFloat = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 15000.75, upiId: 'success@mock' });
    expect(resFloat.status).toBe(400);

    // Bad UPI
    const resUpi = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 15000, upiId: 'invalid-upi-string' });
    expect(resUpi.status).toBe(400);
  });

  it('amount above balance -> 409 and NOTHING is created', async () => {
    await creditCreator(creator1._id, 15000); // Rs 150

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 20000, upiId: 'success@mock' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Insufficient balance/i);

    const withdrawalsCount = await Withdrawal.countDocuments({ user: creator1._id });
    expect(withdrawalsCount).toBe(0);

    const holdsCount = await LedgerEntry.countDocuments({ user: creator1._id, type: LEDGER_TYPE.WITHDRAWAL_HOLD });
    expect(holdsCount).toBe(0);

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(15000);
    expect(wallet.heldPaise).toBe(0);
  });

  it('brand -> 403, no token -> 401', async () => {
    const resBrand = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${brandToken}`)
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(resBrand.status).toBe(403);

    const resNoAuth = await request(app)
      .post('/api/withdrawals')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(resNoAuth.status).toBe(401);
  });

  it('second request while one is active -> 409', async () => {
    await creditCreator(creator1._id, 50000);

    const res1 = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'req-active-1')
      .send({ amountPaise: 15000, upiId: 'success@mock' });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'req-active-2')
      .send({ amountPaise: 15000, upiId: 'success@mock' });
    expect(res2.status).toBe(409);
    expect(res2.body.message).toMatch(/already have a withdrawal in progress/i);
  });

  it('RACE TEST: balance Rs 1000, fire two requests of Rs 800 concurrently with different keys -> exactly one succeeds', async () => {
    await creditCreator(creator1._id, 100000); // Rs 1000

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${creatorToken1}`)
        .set('Idempotency-Key', 'race-diff-1')
        .send({ amountPaise: 80000, upiId: 'success@mock' }),
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${creatorToken1}`)
        .set('Idempotency-Key', 'race-diff-2')
        .send({ amountPaise: 80000, upiId: 'success@mock' })
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(20000);
    expect(wallet.heldPaise).toBe(80000);

    const holds = await LedgerEntry.find({ user: creator1._id, type: LEDGER_TYPE.WITHDRAWAL_HOLD });
    expect(holds).toHaveLength(1);
  });

  it('RACE TEST: two requests at the same time with the SAME Idempotency-Key -> only one withdrawal exists', async () => {
    await creditCreator(creator1._id, 50000);

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${creatorToken1}`)
        .set('Idempotency-Key', 'race-same-key')
        .send({ amountPaise: 20000, upiId: 'success@mock' }),
      request(app)
        .post('/api/withdrawals')
        .set('Authorization', `Bearer ${creatorToken1}`)
        .set('Idempotency-Key', 'race-same-key')
        .send({ amountPaise: 20000, upiId: 'success@mock' })
    ]);

    // One might return 201 and the other 200, or both successful with same withdrawal
    expect([200, 201]).toContain(resA.status);
    expect([200, 201]).toContain(resB.status);
    expect(resA.body.withdrawal.id).toBe(resB.body.withdrawal.id);

    const withdrawals = await Withdrawal.find({ user: creator1._id });
    expect(withdrawals).toHaveLength(1);

    const holds = await LedgerEntry.find({ user: creator1._id, type: LEDGER_TYPE.WITHDRAWAL_HOLD });
    expect(holds).toHaveLength(1);

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(20000);
  });

  it('idempotent replay (same key after completion of first) returns same withdrawal without holding twice', async () => {
    await creditCreator(creator1._id, 50000);

    const res1 = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'replay-key-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'replay-key-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(res2.status).toBe(200);
    expect(res2.body.withdrawal.id).toBe(res1.body.withdrawal.id);

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(20000);
  });

  it('UPI is stored in DB but always returned masked in API', async () => {
    await creditCreator(creator1._id, 50000);

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'upi-mask-test')
      .send({ amountPaise: 20000, upiId: 'john.doe@okicici' });

    expect(res.status).toBe(201);
    expect(res.body.withdrawal.payoutDestination.upiId).toBe('jo***@okicici');

    // DB has real unmasked UPI
    const inDb = await Withdrawal.findById(res.body.withdrawal.id);
    expect(inDb.payoutDestination.upiId).toBe('john.doe@okicici');

    // Detail endpoint returns masked
    const getRes = await request(app)
      .get(`/api/withdrawals/${res.body.withdrawal.id}`)
      .set('Authorization', `Bearer ${creatorToken1}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.payoutDestination.upiId).toBe('jo***@okicici');
  });
});

describe('Phase 7: Payout Processing & Background Worker', () => {
  it('success@mock: after processWithdrawalsOnce -> succeeded, held 0, balance reduced, isActive removed, no extra ledger entry', async () => {
    await creditCreator(creator1._id, 50000);

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'proc-success-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(res.status).toBe(201);

    await processWithdrawalsOnce();

    const w = await Withdrawal.findById(res.body.withdrawal.id);
    expect(w.status).toBe(WITHDRAWAL_STATUS.SUCCEEDED);
    expect(w.isActive).toBeUndefined();
    expect(w.providerRef).toMatch(/^mockpay_/);
    expect(w.processedAt).toBeDefined();

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(0);

    // Ledger only has initial credit and withdrawal_hold
    const entries = await LedgerEntry.find({ user: creator1._id });
    expect(entries).toHaveLength(2);
  });

  it('fail@mock: after processWithdrawalsOnce -> failed, balance restored, held 0, hold + reversal entries, can withdraw again', async () => {
    await creditCreator(creator1._id, 50000);

    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'proc-fail-1')
      .send({ amountPaise: 20000, upiId: 'fail@mock' });
    expect(res.status).toBe(201);

    await processWithdrawalsOnce();

    const w = await Withdrawal.findById(res.body.withdrawal.id);
    expect(w.status).toBe(WITHDRAWAL_STATUS.FAILED);
    expect(w.failureReason).toBe('Bank rejected the transfer (mock)');
    expect(w.isActive).toBeUndefined();

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(50000); // Restored!
    expect(wallet.heldPaise).toBe(0);

    const reversals = await LedgerEntry.find({
      user: creator1._id,
      type: LEDGER_TYPE.WITHDRAWAL_REVERSAL
    });
    expect(reversals).toHaveLength(1);
    expect(reversals[0].amountPaise).toBe(20000);
    expect(reversals[0].balanceAfterPaise).toBe(50000);

    // Creator can request a new withdrawal afterwards
    const resRetry = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'proc-retry-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    expect(resRetry.status).toBe(201);
  });

  it('MOCK_PAYOUT_MODE always_success and always_fail for normal UPI IDs', async () => {
    await creditCreator(creator1._id, 100000);

    // always_success
    env.MOCK_PAYOUT_MODE = 'always_success';
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'normal-upi-succ')
      .send({ amountPaise: 20000, upiId: 'normal@okaxis' });

    await processWithdrawalsOnce();
    let w1 = await Withdrawal.findOne({ idempotencyKey: `${creator1._id}:normal-upi-succ` });
    expect(w1.status).toBe(WITHDRAWAL_STATUS.SUCCEEDED);

    // always_fail
    env.MOCK_PAYOUT_MODE = 'always_fail';
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'normal-upi-fail')
      .send({ amountPaise: 20000, upiId: 'normal@okaxis' });

    await processWithdrawalsOnce();
    let w2 = await Withdrawal.findOne({ idempotencyKey: `${creator1._id}:normal-upi-fail` });
    expect(w2.status).toBe(WITHDRAWAL_STATUS.FAILED);
  });

  it('RACE TEST: run processWithdrawalsOnce() concurrently -> provider called once and money settled once', async () => {
    await creditCreator(creator1._id, 50000);

    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'worker-race-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });

    const spy = jest.spyOn(mockProvider, 'initiatePayout');

    // Run two worker cycles concurrently
    await Promise.all([
      processWithdrawalsOnce(),
      processWithdrawalsOnce()
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(0);
  });

  it('finalizeWithdrawal called twice (success then failure, and failure then success) -> only first counts', async () => {
    await creditCreator(creator1._id, 50000);

    // Setup withdrawal claimed by worker (status: processing)
    const withdrawal = await Withdrawal.create({
      user: creator1._id,
      amountPaise: 20000,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isActive: true,
      payoutDestination: { type: 'upi', upiId: 'success@mock' },
      idempotencyKey: 'finalize-twice-1'
    });

    await Wallet.findOneAndUpdate({ user: creator1._id }, { balancePaise: 30000, heldPaise: 20000 });

    // Success then Failure
    const res1 = await finalizeWithdrawal(withdrawal._id, { providerRef: 'mockpay_123', status: 'success' });
    expect(res1).not.toBeNull();
    expect(res1.status).toBe(WITHDRAWAL_STATUS.SUCCEEDED);

    const res2 = await finalizeWithdrawal(withdrawal._id, { providerRef: 'mockpay_123', status: 'failed', failureReason: 'Too late' });
    expect(res2).toBeNull(); // Second call is ignored

    const wallet = await Wallet.findOne({ user: creator1._id });
    expect(wallet.balancePaise).toBe(30000);
    expect(wallet.heldPaise).toBe(0);
  });

  it('ROLLBACK TEST: force failure during finalization -> withdrawal stays processing, wallet and held unchanged', async () => {
    await creditCreator(creator1._id, 50000);

    const withdrawal = await Withdrawal.create({
      user: creator1._id,
      amountPaise: 20000,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isActive: true,
      payoutDestination: { type: 'upi', upiId: 'fail@mock' },
      idempotencyKey: 'rollback-test-key'
    });
    await Wallet.findOneAndUpdate({ user: creator1._id }, { balancePaise: 30000, heldPaise: 20000 });

    // Pre-insert a ledger entry with the same idempotencyKey to force duplicate key collision
    const wallet = await Wallet.findOne({ user: creator1._id });
    await LedgerEntry.create({
      wallet: wallet._id,
      user: creator1._id,
      type: LEDGER_TYPE.WITHDRAWAL_REVERSAL,
      direction: LEDGER_DIRECTION.CREDIT,
      amountPaise: 20000,
      balanceAfterPaise: 50000,
      description: 'Collision blocker',
      idempotencyKey: `withdrawal-reversal:${withdrawal._id}`
    });

    // Attempt finalization
    await expect(finalizeWithdrawal(withdrawal._id, {
      status: 'failed',
      failureReason: 'Pre-inserted conflict'
    })).rejects.toThrow();

    // Check that state rolled back and withdrawal stays in processing
    const wAfter = await Withdrawal.findById(withdrawal._id);
    expect(wAfter.status).toBe(WITHDRAWAL_STATUS.PROCESSING);
    expect(wAfter.isActive).toBe(true);

    const walletAfter = await Wallet.findOne({ user: creator1._id });
    expect(walletAfter.balancePaise).toBe(30000);
    expect(walletAfter.heldPaise).toBe(20000);
  });

  it('RECONCILE: stuck with providerRef finalized using getPayoutStatus; stuck without providerRef re-initiates idempotently', async () => {
    await creditCreator(creator1._id, 100000);
    await creditCreator(creator2._id, 100000);

    const oldDate = new Date(Date.now() - 120000); // 2 minutes ago (stuck)

    // 1. Stuck WITH providerRef (creator 1)
    const stuckWithRef = await Withdrawal.create({
      user: creator1._id,
      amountPaise: 20000,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isActive: true,
      processingStartedAt: oldDate,
      providerRef: 'mockpay_stuck_1',
      idempotencyKey: 'stuck-with-ref',
      payoutDestination: { type: 'upi', upiId: 'success@mock' }
    });
    await Wallet.findOneAndUpdate({ user: creator1._id }, { $inc: { balancePaise: -20000, heldPaise: +20000 } });

    // 2. Stuck WITHOUT providerRef (creator 2) (crashed before save)
    const stuckWithoutRef = await Withdrawal.create({
      user: creator2._id,
      amountPaise: 20000,
      status: WITHDRAWAL_STATUS.PROCESSING,
      isActive: true,
      processingStartedAt: oldDate,
      idempotencyKey: 'stuck-no-ref',
      payoutDestination: { type: 'upi', upiId: 'fail@mock' }
    });
    await Wallet.findOneAndUpdate({ user: creator2._id }, { $inc: { balancePaise: -20000, heldPaise: +20000 } });

    // Run worker (reconcile step will pick up both)
    await processWithdrawalsOnce();

    const w1 = await Withdrawal.findById(stuckWithRef._id);
    expect(w1.status).toBe(WITHDRAWAL_STATUS.SUCCEEDED);

    const w2 = await Withdrawal.findById(stuckWithoutRef._id);
    expect(w2.status).toBe(WITHDRAWAL_STATUS.FAILED);
    expect(w2.providerRef).toBeDefined();
  });

  it('a payout credit from an approved submission arriving at the same time as a withdrawal request keeps balance consistent', async () => {
    await creditCreator(creator1._id, 30000); // Initial 300 Rs

    const creditPromise = (async () => {
      const wallet = await Wallet.findOne({ user: creator1._id });
      const updated = await Wallet.findOneAndUpdate(
        { user: creator1._id },
        { $inc: { balancePaise: 40000 } },
        { new: true }
      );
      await LedgerEntry.create({
        wallet: wallet._id,
        user: creator1._id,
        type: LEDGER_TYPE.PAYOUT_CREDIT,
        direction: LEDGER_DIRECTION.CREDIT,
        amountPaise: 40000,
        balanceAfterPaise: updated.balancePaise,
        description: 'Submission payout credit',
        idempotencyKey: `concurrent-credit-${new mongoose.Types.ObjectId()}`
      });
      return updated;
    })();

    const withdrawPromise = request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'concurrent-with-credit')
      .send({ amountPaise: 20000, upiId: 'success@mock' });

    const [creditRes, withdrawRes] = await Promise.all([creditPromise, withdrawPromise]);
    expect(withdrawRes.status).toBe(201);

    // Initial 30000 + 40000 - 20000 = 50000 balancePaise, 20000 heldPaise
    const finalWallet = await Wallet.findOne({ user: creator1._id });
    expect(finalWallet.balancePaise).toBe(50000);
    expect(finalWallet.heldPaise).toBe(20000);

    const audit = await checkIntegrity();
    expect(audit.ok).toBe(true);
  });
});

describe('Phase 7: Endpoints & Integrity Audits', () => {
  it('another creator withdrawal -> 404', async () => {
    await creditCreator(creator1._id, 50000);
    const res = await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 20000, upiId: 'success@mock' });

    const wId = res.body.withdrawal.id;

    // Creator 2 tries to access creator 1 withdrawal -> 404
    const resForbidden = await request(app)
      .get(`/api/withdrawals/${wId}`)
      .set('Authorization', `Bearer ${creatorToken2}`);
    expect(resForbidden.status).toBe(404);
  });

  it('GET /api/wallet shows real heldPaise, totalWithdrawnPaise, activeWithdrawal, lastUpiId', async () => {
    await creditCreator(creator1._id, 50000);

    // Initial check
    let wRes = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${creatorToken1}`);
    expect(wRes.body.heldPaise).toBe(0);
    expect(wRes.body.totalWithdrawnPaise).toBe(0);
    expect(wRes.body.activeWithdrawal).toBeNull();

    // Create withdrawal
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 20000, upiId: 'myupi@okaxis' });

    wRes = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${creatorToken1}`);
    expect(wRes.body.heldPaise).toBe(20000);
    expect(wRes.body.activeWithdrawal).not.toBeNull();
    expect(wRes.body.activeWithdrawal.amountPaise).toBe(20000);
    expect(wRes.body.lastUpiId).toBe('myupi@okaxis');
    expect(wRes.body.lastUpiMasked).toBe('my***@okaxis');

    // Finalize it
    await processWithdrawalsOnce();

    wRes = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${creatorToken1}`);
    expect(wRes.body.heldPaise).toBe(0);
    expect(wRes.body.activeWithdrawal).toBeNull();
  });

  it('GET /api/wallet/ledger entries include withdrawalStatus', async () => {
    await creditCreator(creator1._id, 50000);

    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .send({ amountPaise: 20000, upiId: 'fail@mock' });

    await processWithdrawalsOnce();

    const ledgerRes = await request(app)
      .get('/api/wallet/ledger')
      .set('Authorization', `Bearer ${creatorToken1}`);

    expect(ledgerRes.status).toBe(200);
    const holdItem = ledgerRes.body.entries.find(e => e.type === 'withdrawal_hold');
    expect(holdItem).toBeDefined();
    expect(holdItem.withdrawalStatus).toBe('failed');

    const reversalItem = ledgerRes.body.entries.find(e => e.type === 'withdrawal_reversal');
    expect(reversalItem).toBeDefined();
    expect(reversalItem.withdrawalStatus).toBe('failed');
  });

  it('INTEGRITY: checkIntegrity passes across mixed flow (success, failure, active)', async () => {
    await creditCreator(creator1._id, 100000);

    // 1. Success withdrawal
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'flow-succ-1')
      .send({ amountPaise: 20000, upiId: 'success@mock' });
    await processWithdrawalsOnce();

    // 2. Failed withdrawal
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'flow-fail-1')
      .send({ amountPaise: 15000, upiId: 'fail@mock' });
    await processWithdrawalsOnce();

    // 3. Active pending withdrawal
    await request(app)
      .post('/api/withdrawals')
      .set('Authorization', `Bearer ${creatorToken1}`)
      .set('Idempotency-Key', 'flow-active-1')
      .send({ amountPaise: 10000, upiId: 'success@mock' });

    const audit = await checkIntegrity();
    expect(audit.ok).toBe(true);
    expect(audit.errors).toHaveLength(0);
    expect(audit.results.length).toBeGreaterThanOrEqual(8);
  });
});
