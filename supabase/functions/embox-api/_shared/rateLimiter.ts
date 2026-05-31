// Simple in-memory sliding-window rate limiter for Edge Functions.
// Since Edge Function instances are ephemeral, this protects against burst
// abuse within a single instance lifetime. For cross-instance enforcement,
// consider Redis or a database-backed counter.
//
// After a cold start, counters reset — this is acceptable for the MVP and
// stops the most common abuse patterns (tight loops, buggy clients).

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

// Clean up expired windows periodically (every 60s)
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, w] of store) {
    if (now > w.resetAt) store.delete(key);
  }
}

/**
 * Returns `true` if the request is within the rate limit, `false` if exceeded.
 *
 * @param key       Unique identifier (e.g. IP or `IP:path`)
 * @param maxRequests  Max allowed requests
 * @param windowMs     Time window in milliseconds
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, {count: 1, resetAt: now + windowMs});
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/** Extract client IP from request headers (best-effort). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

// ── Pre-configured limiters (mirrors Express setup) ─────────────────────────

const API_MAX = 1000;
const API_WINDOW = 60_000; // 1 min
const UPLOAD_MAX = 20;
const UPLOAD_WINDOW = 60_000; // 1 min
const AUTH_MAX = 10;
const AUTH_WINDOW = 60_000; // 1 min

export function apiRateLimit(req: Request): boolean {
  return checkRateLimit(`api:${getClientIp(req)}`, API_MAX, API_WINDOW);
}

export function uploadRateLimit(req: Request): boolean {
  return checkRateLimit(`upload:${getClientIp(req)}`, UPLOAD_MAX, UPLOAD_WINDOW);
}

export function authRateLimit(req: Request): boolean {
  return checkRateLimit(`auth:${getClientIp(req)}`, AUTH_MAX, AUTH_WINDOW);
}
