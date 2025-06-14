const winston = require('winston');
const path = require('path');

// 로그 디렉토리 생성
const logDir = path.join(__dirname, '../logs');
require('fs').mkdirSync(logDir, { recursive: true });

// 로그 포맷 정의
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// 콘솔 출력용 포맷
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// 로거 생성
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'rainbow-rich-auth' },
  transports: [
    // 에러 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // 모든 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // 액세스 로그 파일
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  ],
});

// 개발 환경에서는 콘솔에도 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// 보안 관련 로그를 위한 별도 로거
const securityLogger = winston.createLogger({
  level: 'warn',
  format: logFormat,
  defaultMeta: { service: 'rainbow-rich-auth', type: 'security' },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'security.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  ],
});

// 로그 헬퍼 함수들
const logHelpers = {
  // 인증 시도 로그
  logAuthAttempt: (username, ip, success) => {
    const message = `Authentication attempt for ${username} from ${ip}: ${success ? 'SUCCESS' : 'FAILED'}`;
    if (success) {
      logger.info(message);
    } else {
      securityLogger.warn(message);
    }
  },

  // 관리자 액션 로그
  logAdminAction: (action, username, ip) => {
    const message = `Admin action: ${action} for user ${username} from ${ip}`;
    logger.info(message);
    securityLogger.info(message);
  },

  // 보안 이벤트 로그
  logSecurityEvent: (event, details, ip) => {
    const message = `Security event: ${event} - ${details} from ${ip}`;
    securityLogger.warn(message);
  },

  // API 요청 로그
  logApiRequest: (method, path, ip, statusCode, responseTime) => {
    const message = `${method} ${path} - ${ip} - ${statusCode} - ${responseTime}ms`;
    logger.info(message);
  },

  // 에러 로그
  logError: (error, context = '') => {
    const message = `Error ${context}: ${error.message}`;
    logger.error(message, { stack: error.stack });
  }
};

// 로거와 헬퍼 함수들을 합친 객체 내보내기
module.exports = {
  ...logger,
  ...logHelpers,
  securityLogger
}; 