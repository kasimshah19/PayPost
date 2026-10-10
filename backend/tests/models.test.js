const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const models = require('../src/models');
const { MIN_WITHDRAWAL_PAISE } = require('../src/constants');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  
  for (const Model of Object.values(models)) {
    await Model.syncIndexes();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

describe('Database Models', () => {
  describe('Campaign', () => {
    it('rejects perCreatorFeePaise > budgetPaise', async () => {
      const campaign = new models.Campaign({
        brand: new mongoose.Types.ObjectId(),
        title: 'Test',
        budgetPaise: 100,
        perCreatorFeePaise: 150,
        slots: 1,
        applicationDeadline: new Date(),
        submissionDeadline: new Date(Date.now() + 10000)
      });
      await expect(campaign.save()).rejects.toThrow(/perCreatorFeePaise cannot exceed budgetPaise/);
    });

    it('rejects slots < 1', async () => {
      const campaign = new models.Campaign({
        brand: new mongoose.Types.ObjectId(),
        title: 'Test',
        budgetPaise: 100,
        perCreatorFeePaise: 50,
        slots: 0,
        applicationDeadline: new Date(),
        submissionDeadline: new Date(Date.now() + 10000)
      });
      await expect(campaign.save()).rejects.toThrow();
    });

    it('rejects submissionDeadline before applicationDeadline', async () => {
      const campaign = new models.Campaign({
        brand: new mongoose.Types.ObjectId(),
        title: 'Test',
        budgetPaise: 100,
        perCreatorFeePaise: 50,
        slots: 1,
        applicationDeadline: new Date(Date.now() + 10000),
        submissionDeadline: new Date()
      });
      await expect(campaign.save()).rejects.toThrow(/submissionDeadline must be after applicationDeadline/);
    });

    it('computes virtuals availablePaise and slotsLeft correctly', () => {
      const campaign = new models.Campaign({
        budgetPaise: 1000,
        reservedPaise: 200,
        paidOutPaise: 300,
        slots: 10,
        approvedCount: 3
      });
      expect(campaign.availablePaise).toBe(500);
      expect(campaign.slotsLeft).toBe(7);
    });

    it('rejects floats and negatives for money fields', async () => {
      const campaign = new models.Campaign({
        brand: new mongoose.Types.ObjectId(),
        title: 'Test',
        budgetPaise: 100.5,
        perCreatorFeePaise: -50,
        slots: 1,
        applicationDeadline: new Date(),
        submissionDeadline: new Date(Date.now() + 10000)
      });
      await expect(campaign.save()).rejects.toThrow();
    });
  });

  describe('Application', () => {
    it('duplicate (campaign, creator) is rejected', async () => {
      const campaignId = new mongoose.Types.ObjectId();
      const creatorId = new mongoose.Types.ObjectId();
      
      await models.Application.create({ campaign: campaignId, creator: creatorId });
      
      const duplicate = new models.Application({ campaign: campaignId, creator: creatorId });
      await expect(duplicate.save()).rejects.toThrow(/duplicate key error/);
    });

    it('invalid status rejected', async () => {
      const app = new models.Application({
        campaign: new mongoose.Types.ObjectId(),
        creator: new mongoose.Types.ObjectId(),
        status: 'invalid_status'
      });
      await expect(app.save()).rejects.toThrow();
    });
  });

  describe('Submission', () => {
    it('only one per application', async () => {
      const appId = new mongoose.Types.ObjectId();
      const payload = {
        application: appId,
        campaign: new mongoose.Types.ObjectId(),
        creator: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        postUrl: 'https://instagram.com/p/123'
      };
      
      await models.Submission.create(payload);
      const duplicate = new models.Submission(payload);
      await expect(duplicate.save()).rejects.toThrow(/duplicate key error/);
    });

    it('non-Instagram URL rejected', async () => {
      const sub = new models.Submission({
        application: new mongoose.Types.ObjectId(),
        campaign: new mongoose.Types.ObjectId(),
        creator: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        postUrl: 'https://google.com'
      });
      await expect(sub.save()).rejects.toThrow(/must be a valid https Instagram URL/);
    });

    it('revisionCount above 2 rejected', async () => {
      const sub = new models.Submission({
        application: new mongoose.Types.ObjectId(),
        campaign: new mongoose.Types.ObjectId(),
        creator: new mongoose.Types.ObjectId(),
        brand: new mongoose.Types.ObjectId(),
        postUrl: 'https://instagram.com/p/123',
        revisionCount: 3
      });
      await expect(sub.save()).rejects.toThrow();
    });
  });

  describe('Wallet', () => {
    it('one per user', async () => {
      const userId = new mongoose.Types.ObjectId();
      await models.Wallet.create({ user: userId });
      const duplicate = new models.Wallet({ user: userId });
      await expect(duplicate.save()).rejects.toThrow(/duplicate key error/);
    });

    it('balance cannot go negative', async () => {
      const wallet = new models.Wallet({
        user: new mongoose.Types.ObjectId(),
        balancePaise: -100
      });
      await expect(wallet.save()).rejects.toThrow();
    });
  });

  describe('LedgerEntry', () => {
    const payload = {
      wallet: new mongoose.Types.ObjectId(),
      user: new mongoose.Types.ObjectId(),
      type: 'payout_credit',
      direction: 'credit',
      amountPaise: 100,
      balanceAfterPaise: 100,
      idempotencyKey: 'key1'
    };

    it('duplicate idempotencyKey rejected', async () => {
      await models.LedgerEntry.create(payload);
      const duplicate = new models.LedgerEntry(payload);
      await expect(duplicate.save()).rejects.toThrow(/duplicate key error/);
    });

    it('update attempts throw', async () => {
      const entry = await models.LedgerEntry.create(payload);
      await expect(models.LedgerEntry.updateOne({ _id: entry._id }, { amountPaise: 200 })).rejects.toThrow(/immutable/);
    });

    it('delete attempts throw', async () => {
      const entry = await models.LedgerEntry.create(payload);
      await expect(models.LedgerEntry.deleteOne({ _id: entry._id })).rejects.toThrow(/immutable/);
    });
  });

  describe('Withdrawal', () => {
    it('amount below MIN_WITHDRAWAL_PAISE rejected', async () => {
      const withdrawal = new models.Withdrawal({
        user: new mongoose.Types.ObjectId(),
        amountPaise: MIN_WITHDRAWAL_PAISE - 1
      });
      await expect(withdrawal.save()).rejects.toThrow();
    });
  });

  describe('NotificationJob', () => {
    it('invalid channel rejected', async () => {
      const job = new models.NotificationJob({
        user: new mongoose.Types.ObjectId(),
        channel: 'sms',
        event: 'test',
        message: 'hello',
        scheduledFor: new Date()
      });
      await expect(job.save()).rejects.toThrow();
    });

    it('dedupeKey uniqueness works', async () => {
      const payload = {
        user: new mongoose.Types.ObjectId(),
        channel: 'email',
        event: 'test',
        message: 'hello',
        scheduledFor: new Date(),
        dedupeKey: 'dedupe1'
      };
      await models.NotificationJob.create(payload);
      const duplicate = new models.NotificationJob(payload);
      await expect(duplicate.save()).rejects.toThrow(/duplicate key error/);
    });
  });
});
