const crypto = require('crypto');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.apiSecret = process.env.API_SECRET_KEY;
    this.adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    
    if (!this.apiSecret) {
      throw new Error('API_SECRET_KEY environment variable is required');
    }
    
    if (!this.adminPasswordHash) {
      throw new Error('ADMIN_PASSWORD_HASH environment variable is required');
    }
  }

  /**
   * HMAC-SHA256 서명 생성
   * @param {Object} data - 서명할 데이터
   * @returns {string} - 생성된 서명
   */
  generateSignature(data) {
    try {
      // signature 필드 제외하고 정렬된 JSON 문자열 생성
      const { signature, ...dataToSign } = data;
      const message = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
      
      const hmac = crypto.createHmac('sha256', this.apiSecret);
      hmac.update(message);
      return hmac.digest('hex');
    } catch (error) {
      logger.error(`Error generating signature: ${error.message}`);
      throw error;
    }
  }

  /**
   * HMAC-SHA256 서명 검증
   * @param {Object} data - 검증할 데이터
   * @param {string} providedSignature - 제공된 서명
   * @returns {boolean} - 서명 유효성
   */
  verifySignature(data, providedSignature) {
    try {
      const expectedSignature = this.generateSignature(data);
      
      // 타이밍 공격 방지를 위한 상수 시간 비교
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      logger.error(`Error verifying signature: ${error.message}`);
      return false;
    }
  }

  /**
   * 관리자 비밀번호 검증
   * @param {string} password - 입력된 비밀번호
   * @returns {boolean} - 비밀번호 유효성
   */
  verifyAdminPassword(password) {
    try {
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
      
      // 타이밍 공격 방지를 위한 상수 시간 비교
      return crypto.timingSafeEqual(
        Buffer.from(this.adminPasswordHash, 'hex'),
        Buffer.from(passwordHash, 'hex')
      );
    } catch (error) {
      logger.error(`Error verifying admin password: ${error.message}`);
      return false;
    }
  }

  /**
   * 새로운 관리자 비밀번호 해시 생성
   * @param {string} password - 새 비밀번호
   * @returns {string} - SHA256 해시
   */
  generatePasswordHash(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * 랜덤 API 시크릿 키 생성
   * @returns {string} - 새로운 API 시크릿 키
   */
  generateApiSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 요청 데이터 유효성 검증
   * @param {Object} data - 검증할 데이터
   * @returns {Object} - 검증 결과
   */
  validateRequestData(data) {
    const errors = [];

    // 필수 필드 확인
    if (!data.username) {
      errors.push('Username is required');
    }

    if (!data.timestamp) {
      errors.push('Timestamp is required');
    }

    if (!data.signature) {
      errors.push('Signature is required');
    }

    // 타임스탬프 유효성 확인 (5분 이내)
    if (data.timestamp) {
      const now = Date.now();
      const timeDiff = Math.abs(now - data.timestamp);
      
      if (timeDiff > 300000) { // 5분 = 300,000ms
        errors.push('Request timestamp is too old');
      }
    }

    // 이메일 형식 확인 (간단한 검증)
    if (data.username && !this.isValidEmail(data.username)) {
      errors.push('Invalid email format');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * 이메일 형식 검증
   * @param {string} email - 검증할 이메일
   * @returns {boolean} - 이메일 유효성
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 요청 빈도 제한을 위한 키 생성
   * @param {string} ip - 클라이언트 IP
   * @param {string} username - 사용자명
   * @returns {string} - 레이트 리미팅 키
   */
  generateRateLimitKey(ip, username) {
    return `${ip}:${username}`;
  }

  /**
   * 보안 헤더 생성
   * @returns {Object} - 보안 헤더들
   */
  getSecurityHeaders() {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
  }
}

module.exports = new AuthService(); 