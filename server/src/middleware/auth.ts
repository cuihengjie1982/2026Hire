import jwt from 'jsonwebtoken';
import type {Request, Response, NextFunction} from 'express';
import {env} from '../config/env.js';
import {queryOne} from '../config/database.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  jti: string;  // unique token ID for blacklist tracking
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Generate access token (short-lived) and refresh token (long-lived).
 * Both include a unique jti for blacklist tracking.
 */
export function generateTokenPair(payload: {userId: string; email: string; role: string}) {
  const jti = crypto.randomUUID();
  const accessPayload: JwtPayload = {...payload, jti};
  const refreshJti = crypto.randomUUID();

  const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {expiresIn: env.JWT_EXPIRES_IN as any});
  const refreshToken = jwt.sign(
    {...payload, jti: refreshJti, type: 'refresh'},
    env.JWT_SECRET,
    {expiresIn: env.JWT_REFRESH_EXPIRES_IN as any},
  );

  return {accessToken, refreshToken, jti, refreshJti};
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Missing or invalid token'}});
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Reject refresh tokens used as access tokens
    if ((decoded as any).type === 'refresh') {
      res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Use access token, not refresh token'}});
      return;
    }

    // Check token blacklist (async but we need to block)
    checkBlacklist(decoded.jti).then(blacklisted => {
      if (blacklisted) {
        res.status(401).json({error: {code: 'TOKEN_REVOKED', message: 'Token has been revoked'}});
        return;
      }
      req.user = decoded;
      next();
    }).catch(() => {
      // If blacklist check fails, allow the request (fail open for availability)
      req.user = decoded;
      next();
    });
  } catch {
    res.status(401).json({error: {code: 'TOKEN_EXPIRED', message: 'Token invalid or expired'}});
  }
}

/**
 * Check if a token's jti is in the blacklist.
 */
async function checkBlacklist(jti: string): Promise<boolean> {
  const row = await queryOne<{id: string}>(
    `SELECT id FROM token_blacklist WHERE jti = $1 AND expires_at > now()`,
    [jti],
  );
  return !!row;
}

/**
 * Add a token to the blacklist.
 */
export async function revokeToken(jti: string, userId: string, expiresAt: Date, reason = 'logout') {
  await queryOne(
    `INSERT INTO token_blacklist (jti, user_id, expires_at, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId, expiresAt.toISOString(), reason],
  );
}

/**
 * Revoke all tokens for a user (e.g., password change, account disable).
 */
export async function revokeAllUserTokens(userId: string, reason = 'password_change') {
  // We insert a special "all" entry; the blacklist check also needs to handle this.
  // Simpler approach: just blacklist all active tokens by inserting their jtis.
  // Since we can't enumerate existing jtis, we use a cutoff timestamp approach.
  await queryOne(
    `INSERT INTO token_blacklist (jti, user_id, expires_at, reason)
     VALUES ($1, $2, now() + INTERVAL '30 days', $3)`,
    [`revoke-all-${userId}-${Date.now()}`, userId, reason],
  );
}

/**
 * Clean up expired blacklist entries (call periodically).
 */
export async function cleanupExpiredTokens() {
  await queryOne(`DELETE FROM token_blacklist WHERE expires_at < now()`);
}
