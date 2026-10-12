const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const { initRealtime } = require('./realtime');
const { startWithdrawalWorker } = require('./jobs/withdrawalWorker');
const { startNotificationWorker } = require('./jobs/notificationWorker');

const startServer = async () => {
  await connectDB();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });

  startWithdrawalWorker();
  startNotificationWorker();
};

startServer();
