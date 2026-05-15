import {describe, it, expect, vi} from 'vitest';
import {requireRole} from '../../middleware/requireRole.js';
import type {JwtPayload} from '../../middleware/auth.js';

function createMocks(user?: JwtPayload) {
  const req = {
    user,
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const next = vi.fn();
  return {req, res, next};
}

describe('requireRole', () => {
  it('returns 401 when req.user is not set', () => {
    const {req, res, next} = createMocks();
    const middleware = requireRole('admin');
    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {code: 'UNAUTHORIZED', message: 'Not authenticated'},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has wrong role', () => {
    const {req, res, next} = createMocks({userId: 'u1', email: 'a@b.com', role: 'recruiter', jti: 'test-jti'});
    const middleware = requireRole('admin');
    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {code: 'FORBIDDEN', message: 'Insufficient permissions'},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has the correct role', () => {
    const {req, res, next} = createMocks({userId: 'u1', email: 'a@b.com', role: 'admin', jti: 'test-jti'});
    const middleware = requireRole('admin');
    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows access when user role matches one of multiple allowed roles', () => {
    const {req, res, next} = createMocks({userId: 'u1', email: 'a@b.com', role: 'recruiter', jti: 'test-jti'});
    const middleware = requireRole('admin', 'recruiter', 'manager');
    middleware(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role matches none of the allowed roles', () => {
    const {req, res, next} = createMocks({userId: 'u1', email: 'a@b.com', role: 'viewer', jti: 'test-jti'});
    const middleware = requireRole('admin', 'recruiter');
    middleware(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
