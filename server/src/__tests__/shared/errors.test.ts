import {describe, it, expect} from 'vitest';
import {AppError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError} from '../../shared/errors.js';

describe('AppError', () => {
  it('has statusCode, message, and code', () => {
    const error = new AppError(500, 'Something went wrong', 'INTERNAL_ERROR');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.name).toBe('AppError');
  });

  it('code is optional', () => {
    const error = new AppError(500, 'No code');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('No code');
    expect(error.code).toBeUndefined();
  });
});

describe('NotFoundError', () => {
  it('has 404 status and NOT_FOUND code', () => {
    const error = new NotFoundError('User');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('User not found');
    expect(error.code).toBe('NOT_FOUND');
  });

  it('includes id in message when provided', () => {
    const error = new NotFoundError('User', '123');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('User (123) not found');
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('UnauthorizedError', () => {
  it('has 401 status and UNAUTHORIZED code', () => {
    const error = new UnauthorizedError();
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Unauthorized');
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('accepts a custom message', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Token expired');
    expect(error.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('has 403 status and FORBIDDEN code', () => {
    const error = new ForbiddenError();
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Insufficient permissions');
    expect(error.code).toBe('FORBIDDEN');
  });

  it('accepts a custom message', () => {
    const error = new ForbiddenError('Admin access required');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Admin access required');
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('ValidationError', () => {
  it('has 400 status and VALIDATION_ERROR code', () => {
    const error = new ValidationError('Name is required');
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Name is required');
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
