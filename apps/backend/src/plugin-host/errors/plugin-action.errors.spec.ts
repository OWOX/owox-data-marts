import { ArgumentsHost } from '@nestjs/common';
import { PluginHostExceptionFilter } from '../filters/plugin-host-exception.filter';
import {
  ActionInputInvalidError,
  ActionInputTooLargeError,
  ActionNotDeclaredError,
  ExecutionNotFoundError,
  ExecutionTokenNotAllowedError,
  ExecutionTokenRequiredError,
  InstallationInactiveError,
  TooManyExecutionsError,
} from './plugin-action.errors';
import { PluginHostError } from './plugin-host.errors';

function render(exception: PluginHostError): Record<string, unknown> {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  new PluginHostExceptionFilter().catch(exception, {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/api/plugins/runtime/actions/sync/executions' }),
    }),
  } as unknown as ArgumentsHost);
  return { httpStatus: status.mock.calls[0][0], ...json.mock.calls[0][0] };
}

describe('plugin action errors', () => {
  it.each([
    [new ActionNotDeclaredError('sync'), 404, 'ACTION_NOT_DECLARED'],
    [new ActionInputTooLargeError(), 413, 'INPUT_TOO_LARGE'],
    [new TooManyExecutionsError(), 429, 'TOO_MANY_EXECUTIONS'],
    [new ExecutionTokenNotAllowedError(), 403, 'EXECUTION_TOKEN_NOT_ALLOWED'],
    [new ExecutionTokenRequiredError(), 403, 'EXECUTION_TOKEN_REQUIRED'],
    [new ExecutionNotFoundError(), 404, 'EXECUTION_NOT_FOUND'],
    [new InstallationInactiveError(), 403, 'INSTALLATION_INACTIVE'],
  ])('renders %s to the plugin with its status and code', (error, httpStatus, code) => {
    expect(error).toBeInstanceOf(PluginHostError);
    expect(error.memberVisible).toBe(true);

    const body = render(error);

    expect(body).toMatchObject({ httpStatus, statusCode: httpStatus, code });
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);
  });

  it('names the undeclared action', () => {
    expect(render(new ActionNotDeclaredError('sync')).message).toContain('"sync"');
  });

  it('keeps the schema errors of INVALID_INPUT in errorDetails, which the host forwards', () => {
    const errors = [{ instancePath: '/documentId', message: 'must be string' }];

    expect(render(new ActionInputInvalidError(errors))).toMatchObject({
      httpStatus: 400,
      code: 'INVALID_INPUT',
      message: 'Action input does not match the action schema',
      errorDetails: { errors },
    });
  });

  it.each([
    [new TooManyExecutionsError(), 'This installation already has 5 running executions'],
    [
      new TooManyExecutionsError('Input validation is busy. Try again shortly.'),
      'Input validation is busy. Try again shortly.',
    ],
    [new ExecutionTokenNotAllowedError(), 'A backend action cannot start another action'],
    [
      new ExecutionTokenNotAllowedError('AI Credentials are not available in a backend action'),
      'AI Credentials are not available in a backend action',
    ],
  ])('words %s', (error, message) => {
    expect(render(error).message).toBe(message);
  });
});
