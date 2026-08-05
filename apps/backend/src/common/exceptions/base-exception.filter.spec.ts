import { ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from './base-exception.filter';
import { BusinessViolationException } from './business-violation.exception';

describe('BaseExceptionFilter', () => {
  const createHost = () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ url: '/api/plugins/gallery' }),
      }),
    } as unknown as ArgumentsHost;

    return { host, response };
  };

  it('serializes the error code when the exception carries one', () => {
    const { host, response } = createHost();

    new BaseExceptionFilter().catch(
      new BusinessViolationException(
        'Plugin is temporarily unavailable',
        { pluginId: 'p1' },
        'PLUGIN_SUSPENDED'
      ),
      host
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        path: '/api/plugins/gallery',
        message: 'Plugin is temporarily unavailable',
        code: 'PLUGIN_SUSPENDED',
        errorDetails: { pluginId: 'p1' },
      })
    );
  });

  it('omits the code key entirely for exceptions that do not set one', () => {
    const { host, response } = createHost();

    new BaseExceptionFilter().catch(new BusinessViolationException('Something went wrong'), host);

    const [body] = response.json.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty('code');
    expect(body.message).toBe('Something went wrong');
  });
});
