import type {Request, Response, NextFunction} from 'express';
import {env} from '../config/env.js';

/**
 * CSRF protection for token-based APIs.
 *
 * 安全设计说明：
 * 当前系统仅使用 Bearer Token 认证（不使用 Cookie），因此 CSRF 攻击向量本身不存在。
 * Bearer Token 只能通过 JavaScript 代码添加到请求头，浏览器的自动 Cookie 机制不会携带它。
 *
 * 对 Bearer Token 请求跳过 CSRF 检查是安全的设计决策。
 *
 * ⚠️ 注意：如果未来引入 Cookie-based 认证（如 SSR、Session），
 * 必须移除此 Bearer 绕过逻辑，改为对所有 mutating 请求强制 CSRF 验证。
 *
 * 对非 Bearer 请求的防护：
 * 1. 要求自定义 X-Requested-With 头
 * 2. 校验 Origin/Referer 是否匹配 CORS 白名单
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
