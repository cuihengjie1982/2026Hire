import {Request, Response, NextFunction} from 'express';
import {query} from '../config/database.js';

/**
 * Insert a row into audit_logs.
 *
 * @param action  - Short verb or dotted action, e.g. 'login', 'approval.decide'
 * @param details - Optional JSON-serialisable object with extra context
 * @param req     - Express request (used to extract user, IP, user-agent)
 */
export async function auditLog(
  action: string,
  details?: Record<string, unknown>,
  req?: Request,
): Promise<void> {
  try {
    const userId = (req as any)?.user?.userId ?? null;
    const userEmail = (req as any)?.user?.email ?? null;
    const ipAddress = req?.ip ?? null;
    const userAgent = req?.headers?.['user-agent'] ?? null;

    await query(
      `INSERT INTO audit_logs (user_id, user_email, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        userEmail,
        action,
        JSON.stringify(details ?? {}),
        ipAddress,
        userAgent,
      ],
    );
  } catch (err) {
    // Audit logging must never break the request pipeline.
    console.error('[auditLog] failed to write audit entry:', err);
  }
}

/**
 * Express middleware that automatically logs every mutating request
 * (POST, PATCH, PUT, DELETE) to audit_logs.
 *
 * The action is derived as '{method} {path}', e.g. 'POST /api/candidates'.
 */
const SENSITIVE_FIELDS = ['password', 'newPassword', 'api_key', 'apiKey', 'token', 'original_file_base64', 'confirmPassword'];

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const sanitized = {...(body as Record<string, unknown>)};
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) sanitized[field] = '[REDACTED]';
  }
  return sanitized;
}

export function auditLogMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (!isMutating) {
    next();
    return;
  }

  const action = `${method} ${req.path}`;

  auditLog(action, {body: sanitizeBody(req.body), query: req.query}, req).catch(() => {});

  next();
}

export default auditLogMiddleware;
