const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const authRoutes = require('./routes/auth.routes');
const campaignRoutes = require('./routes/campaign.routes');
const applicationRoutes = require('./routes/application.routes');
const submissionRoutes = require('./routes/submission.routes');
const walletRoutes = require('./routes/wallet.routes');
const withdrawalRoutes = require('./routes/withdrawal.routes');
const feeRoutes = require('./routes/fee.routes');
const notificationRoutes = require('./routes/notification.routes');
const devRoutes = require('./routes/dev.routes');

const app = express();

app.use(express.json());
app.use(cors({ origin: env.CLIENT_URL }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'PayPost API',
    time: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api', applicationRoutes);
app.use('/api', submissionRoutes);

// Dev clock and test routes: NEVER active unless ENABLE_DEV_TOOLS=true AND NODE_ENV is not 'production'
if (env.ENABLE_DEV_TOOLS === true && process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
