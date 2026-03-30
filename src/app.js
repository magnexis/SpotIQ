const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const parkingRoutes = require('./routes/parking.routes');
const heatmapRoutes = require('./routes/heatmap.routes');
const predictionRoutes = require('./routes/prediction.routes');
const paymentRoutes = require('./routes/payment.routes');
const handleStripeWebhook = require('./webhooks/stripe.webhook');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const {requireApiKey} = require('./middleware/apikey.middleware');

//Protect all parking routes with API key middleware
app.use('/api/parking', requireApiKey, parkingRoutes);
app.use('/api/heatmap', requireApiKey, heatmapRoutes);
app.use('/api/prediction', requireApiKey, predictionRoutes);

const app = express();

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false
});

app.disable('x-powered-by');
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.use(cors({
  origin: process.env.CLIENT_URL || '*'
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(apiLimiter);

app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'smart-parking-api',
    timestamp: new Date()
  });
});

app.use('/parking', heatmapRoutes);
app.use('/parking', parkingRoutes);
app.use('/prediction', predictionRoutes);
app.use('/payment', paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
