import { createHttpError } from './errors.js';

/** Mirrors what apps/backend BaseExceptionFilter actually serializes. */
function backendErrorBody(overrides: Record<string, unknown> = {}) {
  return {
    statusCode: 400,
    timestamp: '2026-07-28T10:00:00.000Z',
    path: '/api/plugins/publications',
    message: 'Repository is not accessible',
    ...overrides,
  };
}

const response = (status = 400, statusText = 'Bad Request') =>
  new Response(null, { status, statusText });

describe('createHttpError', () => {
  it('reads the code emitted by the backend exception filter', () => {
    const error = createHttpError(
      response(),
      backendErrorBody({ code: 'GITHUB_REPO_NOT_ACCESSIBLE' })
    );

    expect(error.code).toBe('GITHUB_REPO_NOT_ACCESSIBLE');
    expect(error.status).toBe(400);
    expect(error.message).toContain('Repository is not accessible');
  });

  it('unwraps errorDetails so callers do not reach through the envelope', () => {
    const error = createHttpError(
      response(),
      backendErrorBody({
        code: 'GITHUB_REPO_NOT_ACCESSIBLE',
        errorDetails: { installationUrl: 'https://github.com/apps/owox/installations/new' },
      })
    );

    expect(error.details).toEqual({
      installationUrl: 'https://github.com/apps/owox/installations/new',
    });
  });

  it('keeps reading details from the GlobalExceptionFilter shape', () => {
    // createStorageReadError() throws HttpException({ code, message, details }),
    // which GlobalExceptionFilter spreads verbatim. Both keys are live on the wire.
    const error = createHttpError(response(424, 'Failed Dependency'), {
      code: 'STORAGE_PERMISSION_DENIED',
      message: 'Storage dependency failed',
      details: { providerStatusCode: 403, providerReason: 'accessDenied' },
    });

    expect(error.details).toEqual({ providerStatusCode: 403, providerReason: 'accessDenied' });
  });

  it('falls back to the whole body when a filter sends neither key', () => {
    // IdpExceptionFilter emits { statusCode, message, code, timestamp } only.
    const body = { statusCode: 401, message: 'Invalid token', code: 'INVALID_TOKEN' };
    expect(createHttpError(response(401, 'Unauthorized'), body).details).toEqual(body);
  });

  it('keeps treating 401 as an auth error', () => {
    expect(createHttpError(response(401, 'Unauthorized'), backendErrorBody()).name).toBe(
      'OWOXAuthError'
    );
  });
});
