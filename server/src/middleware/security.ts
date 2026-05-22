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

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: {error: {code: 'RATE_LIMITED', message: 'Too many requests, please try again later'}},
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  message: {error: {code: 'RATE_LIMITED', message: 'Too many login attempts'}},
  standardHeaders: true,
  legacyHeaders: false,
});
