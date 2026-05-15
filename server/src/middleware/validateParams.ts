import type {Request, Response, NextFunction} from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware that validates specified route params are valid UUIDs.
 * Usage: router.get('/:id', validateUuidParams('id'), handler)
 */
export function validateUuidParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !UUID_RE.test(value)) {
        res.status(400).json({error: {code: 'VALIDATION_ERROR', message: `"${name}" must be a valid UUID`}});
        return;
      }
    }
    next();
  };
}
