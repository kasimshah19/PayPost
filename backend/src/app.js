const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const authRoutes = require('./routes/auth.routes');
const pingRoutes = require('./routes/ping.routes');

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
app.use('/api', pingRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
