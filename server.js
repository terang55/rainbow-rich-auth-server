const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

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
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15분
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 최대 100 요청
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// 로깅 미들웨어
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 구독 검증 API
app.post('/api/verify-subscription', [
  body('username').isEmail().normalizeEmail(),
  body('timestamp').isInt({ min: Date.now() - 300000 }), // 5분 이내
  body('signature').isLength({ min: 64, max: 64 })
], async (req, res) => {
  try {
    // 입력 검증
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`Validation error: ${JSON.stringify(errors.array())}`);
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { username, timestamp, signature } = req.body;

    // 서명 검증
    if (!authService.verifySignature(req.body, signature)) {
      logger.warn(`Invalid signature for user: ${username}`);
      return res.status(401).json({
        error: 'Invalid signature'
      });
    }

    // 타임스탬프 검증 (재생 공격 방지)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 300000) { // 5분
      logger.warn(`Timestamp too old for user: ${username}`);
      return res.status(401).json({
        error: 'Request timestamp too old'
      });
    }

    // Firebase에서 구독 확인
    const result = await firebaseService.verifySubscription(username);
    
    logger.info(`Subscription verification for ${username}: ${result.message}`);
    res.json(result);

  } catch (error) {
    logger.error(`Error in verify-subscription: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// 관리자 API - 구독 등록
app.post('/api/admin/subscribe', [
  body('username').isEmail().normalizeEmail(),
  body('duration').isInt({ min: 1, max: 3650 }),
  body('adminPassword').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { username, duration, adminPassword } = req.body;

    // 관리자 권한 확인
    if (!authService.verifyAdminPassword(adminPassword)) {
      logger.warn(`Invalid admin password attempt`);
      return res.status(401).json({
        error: 'Invalid admin credentials'
      });
    }

    const result = await firebaseService.subscribe(username, duration);
    logger.info(`Admin subscription created for ${username}: ${duration} days`);
    res.json(result);

  } catch (error) {
    logger.error(`Error in admin subscribe: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// 관리자 API - 구독 갱신
app.post('/api/admin/renew', [
  body('username').isEmail().normalizeEmail(),
  body('duration').isInt({ min: 1, max: 3650 }),
  body('adminPassword').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { username, duration, adminPassword } = req.body;

    if (!authService.verifyAdminPassword(adminPassword)) {
      return res.status(401).json({
        error: 'Invalid admin credentials'
      });
    }

    const result = await firebaseService.renewSubscription(username, duration);
    logger.info(`Admin subscription renewed for ${username}: ${duration} days`);
    res.json(result);

  } catch (error) {
    logger.error(`Error in admin renew: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// 관리자 API - 구독 취소
app.post('/api/admin/cancel', [
  body('username').isEmail().normalizeEmail(),
  body('adminPassword').isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid input',
        details: errors.array()
      });
    }

    const { username, adminPassword } = req.body;

    if (!authService.verifyAdminPassword(adminPassword)) {
      return res.status(401).json({
        error: 'Invalid admin credentials'
      });
    }

    const result = await firebaseService.cancelSubscription(username);
    logger.info(`Admin subscription cancelled for ${username}`);
    res.json(result);

  } catch (error) {
    logger.error(`Error in admin cancel: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// 404 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// 에러 핸들러
app.use((error, req, res, next) => {
  logger.error(`Unhandled error: ${error.message}`);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// 서버 시작
app.listen(PORT, () => {
  logger.info(`🚀 Auth server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app; 