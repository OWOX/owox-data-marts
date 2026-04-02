import type { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { createServiceLogger } from '../../core/logger.js';

const logger = createServiceLogger('ValidationMiddleware');

/**
 * Validates request body against a given Zod schema.
 * Returns 400 Bad Request if validation fails.
 */
export function validateBody(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Request body validation failed', {
          path: req.path,
          method: req.method,
          issues,
        });

        return res.status(400).json({
          error: 'Invalid request body',
          details: issues,
        });
      }

      logger.error('Unexpected error during body validation', { path: req.path }, error as Error);
      return res.status(500).json({ error: 'Internal server error during validation' });
    }
  };
}
