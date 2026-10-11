const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const { checkIntegrity } = require('../services/integrityService');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB for integrity check...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    console.log('Running ledger and wallet integrity checks...\n');
    const report = await checkIntegrity();

    console.log('================ INTEGRITY AUDIT REPORT ================');
    report.results.forEach((check, index) => {
      const statusTag = check.ok ? '[OK]  ' : '[FAIL]';
      console.log(`${statusTag} Check ${index + 1}: ${check.name}`);
      console.log(`       Details: ${check.details}`);
    });
    console.log('========================================================\n');

    if (!report.ok) {
      console.error('CRITICAL: Integrity violations detected!');
      report.errors.forEach(err => console.error(` - ${err}`));
      process.exit(1);
    } else {
      console.log('ALL INTEGRITY CHECKS PASSED SUCCESSFULLY. Systems healthy.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Integrity check error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
