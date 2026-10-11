const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { backfillWallets } = require('../services/backfillService');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB for wallet backfill...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    console.log('Running wallet backfill...');
    const summary = await backfillWallets();

    console.log('\n--- BACKFILL SUMMARY ---');
    console.log(`Creator Wallets Created: ${summary.walletsCreated}`);
    console.log(`Submissions Credited:   ${summary.submissionsProcessed}`);
    console.log(`Submissions Skipped:    ${summary.submissionsSkipped}`);
    console.log('------------------------\n');
    console.log('Wallet backfill finished successfully.');
  } catch (error) {
    console.error('Wallet backfill failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
