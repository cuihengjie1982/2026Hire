import {describe, it, expect, vi, beforeEach} from 'vitest';
import jwt from 'jsonwebtoken';
import {authMiddleware, type JwtPayload} from '../../middleware/auth.js';

// Mock env to avoid dotenv loading
vi.mock('../../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    DATABASE_URL: 'postgres://test',
    PORT: 4000,
    CORS_ORIGIN: '*',
    JWT_EXPIRES_IN: '1h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    MINERU_API_URL: '',
    MINERU_API_TOKEN: '',
  },
}));

// Mock database module (top-level so authMiddleware can use it)
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn().mockResolvedValue(null), // not blacklisted by default
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

/** Flush the microtask queue so .then() callbacks inside authMiddleware resolve */
const flushMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

function createMocks() {
  const req = {
    headers: {} as Record<string, string | undefined>,
    user: undefined as JwtPayload | undefined,
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const next = vi.fn();
  return {req, res, next};
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', () => {
    const {req, res, next} = createMocks();
    authMiddleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {code: 'UNAUTHORIZED', message: 'Missing or invalid token'},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for non-Bearer scheme', () => {
    const {req, res, next} = createMocks();
    req.headers.authorization = 'Basic dXNlcjpwYXNz';
    authMiddleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {code: 'UNAUTHORIZED', message: 'Missing or invalid token'},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for expired or invalid token', () => {
    const {req, res, next} = createMocks();
    req.headers.authorization = 'Bearer invalid-token';
    authMiddleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {code: 'TOKEN_EXPIRED', message: 'Token invalid or expired'},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next() for a valid token', async () => {
    const {req, res, next} = createMocks();
    const payload: JwtPayload = {userId: 'u1', email: 'a@b.com', role: 'admin', jti: 'test-jti-1'};
    const token = jwt.sign(payload, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;

    authMiddleware(req, res as any, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user!.userId).toBe(payload.userId);
    expect(req.user!.email).toBe(payload.email);
    expect(req.user!.role).toBe(payload.role);
  });

  it('sets correct payload structure on req.user', async () => {
    const {req, res, next} = createMocks();
    const payload: JwtPayload = {userId: 'abc-123', email: 'test@example.com', role: 'recruiter', jti: 'test-jti-2'};
    const token = jwt.sign(payload, 'test-secret');
    req.headers.authorization = `Bearer ${token}`;

    authMiddleware(req, res as any, next);
    await flushMicrotasks();

    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe('abc-123');
    expect(req.user!.email).toBe('test@example.com');
    expect(req.user!.role).toBe('recruiter');
    expect(typeof req.user!.userId).toBe('string');
    expect(typeof req.user!.email).toBe('string');
    expect(typeof req.user!.role).toBe('string');
  });
});
