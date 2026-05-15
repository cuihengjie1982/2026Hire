import type {Request, Response, NextFunction} from 'express';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Not authenticated'}});
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({error: {code: 'FORBIDDEN', message: 'Insufficient permissions'}});
      return;
    }
    next();
  };
}
