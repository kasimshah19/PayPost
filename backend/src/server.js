const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');
const { startWithdrawalWorker } = require('./jobs/withdrawalWorker');

const startServer = async () => {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
  startWithdrawalWorker();
};

startServer();
