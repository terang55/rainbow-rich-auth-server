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

// Render 프록시 환경 설정
app.set('trust proxy', true);

// 보안 미들웨어
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting (Render 프록시 환경 대응)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15분
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 최대 100 요청
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Render 프록시 환경에서 필요
  skip: (req) => {
    // 헬스체크는 rate limit에서 제외
    return req.path === '/health' || req.path === '/';
  }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

// 로깅 미들웨어
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`, {
    service: 'auth-server',
    timestamp: new Date().toISOString()
  });
  next();
});

// 기본 라우트 (루트 경로)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Rainbow Rich Auth Server is running!', 
    version: '1.0.0',
    endpoints: [
      'POST /api/verify',
      'POST /api/subscribe', 
      'POST /api/renew',
      'POST /api/cancel',
      'POST /api/rainbowg/verify',
      'POST /api/rainbowg/subscribe',
      'POST /api/rainbowg/renew',
      'POST /api/rainbowg/cancel',
      'POST /api/admin/subscribe',
      'POST /api/admin/rainbowg/subscribe',
      'GET /health'
    ]
  });
});

// 헬스 체크
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ========================================
// Rainbow Rich 프로그램 API 엔드포인트
// ========================================

// 구독 검증 API (클라이언트용)
app.post('/api/verify', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // Firebase에서 구독 확인
    const result = await firebaseService.verifySubscription(username);
    
    logger.info(`Subscription verification for ${username}: ${result.message}`);
    
    if (result.message === "구독이 유효합니다.") {
      res.json({
        success: true,
        message: '구독이 유효합니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in verify: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 구독 생성 API (클라이언트용)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { username, plan = 'basic', days = 30 } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // 클라이언트에서 전송한 days 값 사용
    const duration = parseInt(days) || 30;
    const result = await firebaseService.subscribe(username, duration);
    
    logger.info(`Subscription created for ${username}: ${duration} days`);
    
    if (result.message === "구독이 업데이트되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 생성되었습니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in subscribe: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 구독 갱신 API (클라이언트용)
app.post('/api/renew', async (req, res) => {
  try {
    const { username, days = 30 } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // 클라이언트에서 전송한 days 값 사용
    const duration = parseInt(days) || 30;
    const result = await firebaseService.renewSubscription(username, duration);
    
    logger.info(`Subscription renewed for ${username}: ${duration} days`);
    
    if (result.message === "구독이 갱신되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 갱신되었습니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in renew: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 구독 취소 API (클라이언트용)
app.post('/api/cancel', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    const result = await firebaseService.cancelSubscription(username);
    
    logger.info(`Subscription cancelled for ${username}`);
    
    if (result.message === "구독이 취소되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 취소되었습니다.'
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in cancel: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// ========================================
// RainbowG 프로그램 전용 API 엔드포인트
// ========================================

// RainbowG 구독 검증 API
app.post('/api/rainbowg/verify', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // Firebase에서 RainbowG 구독 확인 (별도 컬렉션 사용)
    const result = await firebaseService.verifySubscriptionRainbowG(username);
    
    logger.info(`RainbowG subscription verification for ${username}: ${result.message}`);
    
    if (result.message === "구독이 유효합니다.") {
      res.json({
        success: true,
        message: '구독이 유효합니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in RainbowG verify: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// RainbowG 구독 생성 API
app.post('/api/rainbowg/subscribe', async (req, res) => {
  try {
    const { username, days = 30 } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // 클라이언트에서 전송한 days 값 사용
    const duration = parseInt(days) || 30;
    const result = await firebaseService.subscribeRainbowG(username, duration);
    
    logger.info(`RainbowG subscription created for ${username}: ${duration} days`);
    
    if (result.message === "구독이 업데이트되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 생성되었습니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in RainbowG subscribe: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// RainbowG 구독 갱신 API
app.post('/api/rainbowg/renew', async (req, res) => {
  try {
    const { username, days = 30 } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    // 클라이언트에서 전송한 days 값 사용
    const duration = parseInt(days) || 30;
    const result = await firebaseService.renewSubscriptionRainbowG(username, duration);
    
    logger.info(`RainbowG subscription renewed for ${username}: ${duration} days`);
    
    if (result.message === "구독이 갱신되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 갱신되었습니다.',
        expires: result.expires
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in RainbowG renew: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// RainbowG 구독 취소 API
app.post('/api/rainbowg/cancel', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: '사용자명이 필요합니다.'
      });
    }

    const result = await firebaseService.cancelSubscriptionRainbowG(username);
    
    logger.info(`RainbowG subscription cancelled for ${username}`);
    
    if (result.message === "구독이 취소되었습니다.") {
      res.json({
        success: true,
        message: '구독이 성공적으로 취소되었습니다.'
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }

  } catch (error) {
    logger.error(`Error in RainbowG cancel: ${error.message}`);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// ========================================
// 관리자 API 엔드포인트
// ========================================

// 관리자 API - Rainbow Rich 구독 등록
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

// 관리자 API - RainbowG 구독 등록
app.post('/api/admin/rainbowg/subscribe', [
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
      logger.warn(`Invalid admin password attempt for RainbowG`);
      return res.status(401).json({
        error: 'Invalid admin credentials'
      });
    }

    const result = await firebaseService.subscribeRainbowG(username, duration);
    logger.info(`Admin RainbowG subscription created for ${username}: ${duration} days`);
    res.json(result);

  } catch (error) {
    logger.error(`Error in admin RainbowG subscribe: ${error.message}`);
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