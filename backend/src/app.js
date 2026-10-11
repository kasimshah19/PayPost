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
const feeRoutes = require('./routes/fee.routes');
const withdrawalRoutes = require('./routes/withdrawal.routes');

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
app.use('/api/fees', feeRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api', applicationRoutes);
app.use('/api', submissionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
