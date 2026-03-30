import { describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { validateBody } from './validation-middleware.js';

describe('ValidationMiddleware', () => {
  const schema = z.object({
    foo: z.string(),
    bar: z.number().optional(),
  });

  function createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  }

  it('calls next() if validation passes', async () => {
    const req = {
      body: { foo: 'hello', bar: 123 },
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = validateBody(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('updates req.body with parsed value (e.g. removes extra fields)', async () => {
    const req = {
      body: { foo: 'hello', extra: 'field' },
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = validateBody(schema);
    await middleware(req, res, next);

    expect(req.body).toEqual({ foo: 'hello' });
    expect(req.body.extra).toBeUndefined();
  });

  it('returns 400 and details if validation fails', async () => {
    const req = {
      body: { bar: 'not a number' },
    } as Request;
    const res = createMockResponse();
    const next = jest.fn() as NextFunction;

    const middleware = validateBody(schema);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid request body',
        details: expect.arrayContaining([
          expect.objectContaining({ path: 'foo', message: 'Required' }),
          expect.objectContaining({ path: 'bar', message: 'Expected number, received string' }),
        ]),
      })
    );
  });
});
