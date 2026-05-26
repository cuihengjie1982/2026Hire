import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {env} from '../config/env.js';

const allowedConnectSources = env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean);

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://api.dicebear.com"],
      connectSrc: ["'self'", ...allowedConnectSources],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// 通用 API 限流
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: {error: {code: 'RATE_LIMITED', message: 'Too many requests, please try again later'}},
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录接口限流：10 次/分钟
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  message: {error: {code: 'RATE_LIMITED', message: 'Too many login attempts'}},
  standardHeaders: true,
  legacyHeaders: false,
});

// 密码重置/修改 限流：5 次/15分钟
export const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {error: {code: 'RATE_LIMITED', message: 'Too many password attempts, please try again later'}},
  standardHeaders: true,
  legacyHeaders: false,
});

// Token 刷新 限流：30 次/分钟
export const tokenRefreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {error: {code: 'RATE_LIMITED', message: 'Too many token refresh attempts'}},
  standardHeaders: true,
  legacyHeaders: false,
});

// 文件上传 限流：20 次/分钟
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: {error: {code: 'RATE_LIMITED', message: 'Too many upload attempts'}},
  standardHeaders: true,
  legacyHeaders: false,
});
