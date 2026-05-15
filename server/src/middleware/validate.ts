import type {Request, Response, NextFunction} from 'express';

type ValidationRule = {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'array' | 'email';
  maxLength?: number;
  minLength?: number;
};

export function validate(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];
    for (const rule of rules) {
      const value = req.body[rule.field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }
      if (value === undefined || value === null) continue;
      if (rule.type === 'email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(`${rule.field} must be a valid email`);
      }
      if (rule.type === 'array' && !Array.isArray(value)) {
        errors.push(`${rule.field} must be an array`);
      }
      if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
        errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
      }
      if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
      }
    }
    if (errors.length > 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: errors.join('; ')}});
      return;
    }
    next();
  };
}
