const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const firebaseService = require('./services/firebaseService');
const authService = require('./services/authService');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// 보안 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' }
});
app.use('/api', limiter);

// 로깅
app.use(morgan('combined'));

// JSON 파싱
app.use(express.json({ limit: '10mb' }));

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ 
    message: 'Rainbow Rich Auth Server is running!', 
    version: '1.0.0',
    endpoints: [
      'POST /api/verify',
      'POST /api/subscribe', 
      'POST /api/renew',
      'POST /api/cancel',
      'GET /health'
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API 라우트들
app.post('/api/verify', authService.verifyRequest, async (req, res) => {
  try {
    const { username } = req.body;
    const result = await firebaseService.verifySubscription(username);
    res.json(result);
  } catch (error) {
    logger.error(`Verify subscription error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

app.post('/api/subscribe', authService.verifyRequest, async (req, res) => {
  try {
    const { username, duration } = req.body;
    const result = await firebaseService.subscribe(username, duration);
    res.json(result);
  } catch (error) {
    logger.error(`Subscribe error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

app.post('/api/renew', authService.verifyRequest, async (req, res) => {
  try {
    const { username, duration } = req.body;
    const result = await firebaseService.renewSubscription(username, duration);
    res.json(result);
  } catch (error) {
    logger.error(`Renew subscription error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

app.post('/api/cancel', authService.verifyRequest, async (req, res) => {
  try {
    const { username } = req.body;
    const result = await firebaseService.cancelSubscription(username);
    res.json(result);
  } catch (error) {
    logger.error(`Cancel subscription error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 관리자 라우트들
app.post('/api/admin/subscriptions', authService.verifyRequest, authService.verifyAdmin, async (req, res) => {
  try {
    const result = await firebaseService.getAllSubscriptions();
    res.json(result);
  } catch (error) {
    logger.error(`Get all subscriptions error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

app.post('/api/admin/stats', authService.verifyRequest, authService.verifyAdmin, async (req, res) => {
  try {
    const result = await firebaseService.getSubscriptionStats();
    res.json(result);
  } catch (error) {
    logger.error(`Get subscription stats error: ${error.message}`);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  logger.error(`Unhandled error: ${error.message}`);
  res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' });
});

// 서버 시작
app.listen(PORT, () => {
  logger.info(`🚀 Auth server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;