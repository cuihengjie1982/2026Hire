import type {Request, Response, NextFunction} from 'express';
import {AppError} from '../shared/errors.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(`[ERROR] ${err.message}`, err.stack);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code || 'ERROR',
        message: err.message,
      },
    });
    return;
  }

  // PostgreSQL errors
  if ('code' in err && typeof (err as {code: unknown}).code === 'string') {
    const pgCode = (err as {code: string}).code;
    if (pgCode === '23505') {
      res.status(409).json({error: {code: 'DUPLICATE', message: 'Record already exists'}});
      return;
    }
    if (pgCode === '23503') {
      res.status(400).json({error: {code: 'FK_VIOLATION', message: 'Referenced record not found'}});
      return;
    }
  }

  res.status(500).json({error: {code: 'INTERNAL_ERROR', message: 'Internal server error'}});
}
