require('dotenv').config();

const rawClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const clientOrigins = rawClientUrl.split(',').map(s => s.trim()).filter(Boolean);
const primaryClientUrl = clientOrigins[0] || 'http://localhost:5173';

const env = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  CLIENT_URL: primaryClientUrl,
  ALLOWED_ORIGINS: clientOrigins,
  MOCK_PAYOUT_DELAY_MS: process.env.MOCK_PAYOUT_DELAY_MS !== undefined ? Number(process.env.MOCK_PAYOUT_DELAY_MS) : 4000,
  MOCK_PAYOUT_MODE: process.env.MOCK_PAYOUT_MODE || 'random',
  MOCK_PAYOUT_SUCCESS_RATE: process.env.MOCK_PAYOUT_SUCCESS_RATE !== undefined ? Number(process.env.MOCK_PAYOUT_SUCCESS_RATE) : 0.7,
  WORKER_INTERVAL_MS: process.env.WORKER_INTERVAL_MS !== undefined ? Number(process.env.WORKER_INTERVAL_MS) : 3000,
  WORKER_ENABLED: process.env.WORKER_ENABLED !== 'false',
  STUCK_PROCESSING_AFTER_MS: process.env.STUCK_PROCESSING_AFTER_MS !== undefined ? Number(process.env.STUCK_PROCESSING_AFTER_MS) : 60000,
  NOTIFICATION_WORKER_ENABLED: process.env.NOTIFICATION_WORKER_ENABLED !== 'false',
  NOTIFICATION_WORKER_INTERVAL_MS: process.env.NOTIFICATION_WORKER_INTERVAL_MS !== undefined ? Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) : 5000,
  NOTIFICATION_MAX_ATTEMPTS: process.env.NOTIFICATION_MAX_ATTEMPTS !== undefined ? Number(process.env.NOTIFICATION_MAX_ATTEMPTS) : 3,
  NOTIFICATION_STUCK_AFTER_MS: process.env.NOTIFICATION_STUCK_AFTER_MS !== undefined ? Number(process.env.NOTIFICATION_STUCK_AFTER_MS) : 60000,
  MOCK_NOTIFY_MODE: process.env.MOCK_NOTIFY_MODE || 'random',
  MOCK_NOTIFY_SUCCESS_RATE: process.env.MOCK_NOTIFY_SUCCESS_RATE !== undefined ? Number(process.env.MOCK_NOTIFY_SUCCESS_RATE) : 0.9,
  MOCK_NOTIFY_DELAY_MS: process.env.MOCK_NOTIFY_DELAY_MS !== undefined ? Number(process.env.MOCK_NOTIFY_DELAY_MS) : 200,
  ENABLE_DEV_TOOLS: process.env.ENABLE_DEV_TOOLS === 'true'
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
