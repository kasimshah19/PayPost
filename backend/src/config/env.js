require('dotenv').config();

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  MOCK_PAYOUT_DELAY_MS: process.env.MOCK_PAYOUT_DELAY_MS !== undefined ? Number(process.env.MOCK_PAYOUT_DELAY_MS) : 4000,
  MOCK_PAYOUT_MODE: process.env.MOCK_PAYOUT_MODE || 'random',
  MOCK_PAYOUT_SUCCESS_RATE: process.env.MOCK_PAYOUT_SUCCESS_RATE !== undefined ? Number(process.env.MOCK_PAYOUT_SUCCESS_RATE) : 0.7,
  WORKER_INTERVAL_MS: process.env.WORKER_INTERVAL_MS !== undefined ? Number(process.env.WORKER_INTERVAL_MS) : 3000,
  WORKER_ENABLED: process.env.WORKER_ENABLED !== 'false',
  STUCK_PROCESSING_AFTER_MS: process.env.STUCK_PROCESSING_AFTER_MS !== undefined ? Number(process.env.STUCK_PROCESSING_AFTER_MS) : 60000
};

if (!env.MONGODB_URI) {
  console.error("ERROR: MONGODB_URI is missing in .env");
  process.exit(1);
}

if (!env.JWT_SECRET) {
  console.error("ERROR: JWT_SECRET is missing in .env");
  process.exit(1);
}

module.exports = env;
