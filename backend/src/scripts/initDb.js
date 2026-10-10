const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const models = require('../models');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function initDb() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI is not set in .env');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.\n');

    for (const [name, Model] of Object.entries(models)) {
      console.log(`Processing collection for model: ${name}`);
      try {
        await Model.createCollection();
        console.log(` - Collection created (or already exists).`);
      } catch (err) {
        if (err.code === 48) {
          console.log(` - Collection already exists.`);
        } else {
          console.error(` - Error creating collection:`, err.message);
        }
      }

      await Model.syncIndexes();
      console.log(` - Indexes synced.`);
    }

    console.log('\nDatabase initialization complete.');
  } catch (error) {
    console.error('Initialization error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

initDb();
