const admin = require('firebase-admin');
const logger = require('../utils/logger');

class FirebaseService {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      // Firebase Admin SDK 초기화 (환경 변수 사용)
      if (!admin.apps.length) {
        
        // 환경 변수에서 Firebase 설정 읽기
        const firebaseConfig = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY ? 
            process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
          universe_domain: "googleapis.com"
        };

        // 필수 환경 변수 확인
        const requiredEnvVars = [
          'FIREBASE_PROJECT_ID',
          'FIREBASE_PRIVATE_KEY_ID', 
          'FIREBASE_PRIVATE_KEY',
          'FIREBASE_CLIENT_EMAIL',
          'FIREBASE_CLIENT_ID'
        ];

        for (const envVar of requiredEnvVars) {
          if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
          }
        }
        
        admin.initializeApp({
          credential: admin.credential.cert(firebaseConfig),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      }

      this.db = admin.firestore();
      this.initialized = true;
      logger.info('Firebase service initialized successfully with environment variables');
    } catch (error) {
      logger.error(`Firebase initialization failed: ${error.message}`);
      throw error;
    }
  }

  async verifySubscription(username) {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const docRef = this.db.collection('subscriptions').doc(username);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { message: "구독이 없습니다." };
      }

      const subscriptionInfo = doc.data();
      const expiryDate = new Date(subscriptionInfo.expires);
      const now = new Date();

      if (now > expiryDate) {
        return { message: "구독이 만료되었습니다." };
      } else {
        return { 
          message: "구독이 유효합니다.", 
          expires: subscriptionInfo.expires 
        };
      }
    } catch (error) {
      logger.error(`Error verifying subscription for ${username}: ${error.message}`);
      return { message: "구독 확인 중 오류가 발생했습니다." };
    }
  }

  async subscribe(username, duration) {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + duration);
      const expiryDateStr = expiryDate.toISOString().split('T')[0];

      const subscriptionData = {
        username: username,
        expires: expiryDateStr,
        createdAt: new Date().toISOString(),
        duration: duration
      };

      await this.db.collection('subscriptions').doc(username).set(subscriptionData);
      
      return { 
        message: "구독이 업데이트되었습니다.", 
        expires: expiryDateStr 
      };
    } catch (error) {
      logger.error(`Error creating subscription for ${username}: ${error.message}`);
      return { message: "구독 생성 중 오류가 발생했습니다." };
    }
  }

  async renewSubscription(username, duration) {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const docRef = this.db.collection('subscriptions').doc(username);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { message: "갱신할 구독이 없습니다." };
      }

      const subscriptionInfo = doc.data();
      const currentExpiry = new Date(subscriptionInfo.expires);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + duration);
      const newExpiryStr = newExpiry.toISOString().split('T')[0];

      const updateData = {
        expires: newExpiryStr,
        renewedAt: new Date().toISOString(),
        lastRenewalDuration: duration
      };

      await docRef.update(updateData);

      return { 
        message: "구독이 갱신되었습니다.", 
        expires: newExpiryStr 
      };
    } catch (error) {
      logger.error(`Error renewing subscription for ${username}: ${error.message}`);
      return { message: "구독 갱신 중 오류가 발생했습니다." };
    }
  }

  async cancelSubscription(username) {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const docRef = this.db.collection('subscriptions').doc(username);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { message: "취소할 구독이 없습니다." };
      }

      await docRef.delete();
      return { message: "구독이 취소되었습니다." };
    } catch (error) {
      logger.error(`Error cancelling subscription for ${username}: ${error.message}`);
      return { message: "구독 취소 중 오류가 발생했습니다." };
    }
  }

  async getAllSubscriptions() {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const snapshot = await this.db.collection('subscriptions').get();
      const subscriptions = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const expiryDate = new Date(data.expires);
        const isExpired = new Date() > expiryDate;

        subscriptions.push({
          username: doc.id,
          expires: data.expires,
          status: isExpired ? '만료' : '유효',
          createdAt: data.createdAt || 'N/A'
        });
      });

      return { 
        message: "구독 목록 조회 완료", 
        subscriptions: subscriptions 
      };
    } catch (error) {
      logger.error(`Error getting all subscriptions: ${error.message}`);
      return { message: "구독 목록 조회 중 오류가 발생했습니다." };
    }
  }

  async getSubscriptionStats() {
    try {
      if (!this.initialized) {
        throw new Error('Firebase service not initialized');
      }

      const snapshot = await this.db.collection('subscriptions').get();
      let totalSubscriptions = 0;
      let activeSubscriptions = 0;
      let expiredSubscriptions = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        const expiryDate = new Date(data.expires);
        const isExpired = new Date() > expiryDate;

        totalSubscriptions++;
        if (isExpired) {
          expiredSubscriptions++;
        } else {
          activeSubscriptions++;
        }
      });

      return {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions
      };
    } catch (error) {
      logger.error(`Error getting subscription stats: ${error.message}`);
      return null;
    }
  }

  // 환경 변수 상태 확인 메서드
  checkEnvironmentVariables() {
    const requiredEnvVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY_ID', 
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_CLIENT_ID'
    ];

    const missingVars = [];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missingVars.push(envVar);
      }
    }

    return {
      isValid: missingVars.length === 0,
      missingVariables: missingVars
    };
  }
}

module.exports = new FirebaseService();