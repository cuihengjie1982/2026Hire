import type {Request, Response, NextFunction} from 'express';
import {env} from '../config/env.js';

/**
 * CSRF protection for token-based APIs.
 * Since we use Bearer tokens (not cookies) for auth, CSRF risk is minimal.
 * This middleware adds a defense-in-depth layer by:
 * 1. Requiring a custom X-Requested-With header on mutating requests
 * 2. Checking Origin/Referer headers match the server or are in CORS whitelist
 */

// Parse allowed origins once at startup
const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);

export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  // If using Bearer token auth, CSRF is already mitigated — skip check
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  // For non-Bearer mutating requests, require custom header
  const xRequestedWith = req.headers['x-requested-with'];
  if (xRequestedWith === 'XMLHttpRequest') {
    next();
    return;
  }

  // Check Origin header — allow same-host or CORS-whitelisted origins
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    try {
      const originHost = new URL(origin).host;
      // Same host (e.g. nginx proxy)
      if (host && originHost === host) {
        next();
        return;
      }
      // CORS whitelist (e.g. frontend dev server on different port)
      if (allowedOrigins.includes(origin)) {
        next();
        return;
      }
    } catch { /* invalid origin */ }
  }

  res.status(403).json({error: {code: 'CSRF_CHECK_FAILED', message: 'CSRF validation failed'}});
}
