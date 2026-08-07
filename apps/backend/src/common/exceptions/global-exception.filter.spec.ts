import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

function hostFor(): { host: ArgumentsHost; body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  const response = {
    status: () => response,
    json: (payload: Record<string, unknown>) => {
      captured = payload;
      return response;
    },
  };

  return {
    host: {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ originalUrl: '/api/license-keys', headers: {} }),
      }),
    } as unknown as ArgumentsHost,
    body: () => captured,
  };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  beforeEach(() => {
    jest.spyOn(filter['logger'], 'error').mockImplementation();
    jest.spyOn(filter['logger'], 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('joins the per-constraint messages class-validator reports', () => {
    const { host, body } = hostFor();

    filter.catch(new BadRequestException(['Name is required', 'Origin must be a URL']), host);

    expect(body().message).toBe('Name is required. Origin must be a URL');
    expect(body().statusCode).toBe(400);
  });

  it('keeps a single actionable message as is', () => {
    const { host, body } = hostFor();

    filter.catch(new BadRequestException('"http:::" is not a valid public origin'), host);

    expect(body().message).toBe('"http:::" is not a valid public origin');
  });

  it('falls back to the exception message when the body carries none', () => {
    const { host, body } = hostFor();

    filter.catch(new NotFoundException(), host);

    expect(body().message).toBe('Not Found');
    expect(body().statusCode).toBe(404);
  });
});
