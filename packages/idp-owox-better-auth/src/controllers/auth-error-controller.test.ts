import { describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { AuthErrorController } from './auth-error-controller.js';

function createResponseMock(): Response & { body?: unknown; statusCode?: number } {
  const res = {} as Response & { body?: unknown; statusCode?: number };
  res.statusCode = 200;
  const statusMock = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.status = statusMock as unknown as Response['status'];
  const sendMock = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  });
  res.send = sendMock as unknown as Response['send'];
  return res;
}

describe('AuthErrorController.errorPage', () => {
  const controller = new AuthErrorController();

  it('does not render user-provided error_description and uses known message by code', async () => {
    const req = {
      query: {
        error: 'access_denied',
        error_description: 'User denied access <script>alert(1)</script>',
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.errorPage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const html = String(res.body ?? '');
    expect(html).toContain('Sign in failed');
    expect(html).toContain('Go to home');
    expect(html).toContain(
      'Access was denied. Please try again and grant the required permissions.'
    );
    expect(html).not.toContain('access_denied');
    expect(html).not.toContain('User denied access');
    expect(html).not.toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders known message for standardized Better Auth callback code', async () => {
    const req = {
      query: {
        error: 'state_mismatch',
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.errorPage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const html = String(res.body ?? '');
    expect(html).toContain('Sign-in state mismatch detected. Please try again.');
    expect(html).not.toContain('state_mismatch');
  });

  it('renders fallback message for non-normalized unknown error code without exposing code', async () => {
    const req = {
      query: {
        error: 'STATE_MISMATCH',
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.errorPage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const html = String(res.body ?? '');
    expect(html).toContain('Unable to complete sign in. Please try again.');
    expect(html).not.toContain('STATE_MISMATCH');
  });

  it('renders fallback message when error params are missing', async () => {
    const req = { query: {} } as unknown as Request;
    const res = createResponseMock();

    await controller.errorPage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const html = String(res.body ?? '');
    expect(html).toContain('Unable to complete sign in. Please try again.');
    expect(html).not.toContain('Error code');
  });

  it('renders fallback message when only error_description is provided', async () => {
    const req = {
      query: {
        error_description: 'Provider specific text',
      },
    } as unknown as Request;
    const res = createResponseMock();

    await controller.errorPage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const html = String(res.body ?? '');
    expect(html).toContain('Unable to complete sign in. Please try again.');
    expect(html).not.toContain('Provider specific text');
  });
});
