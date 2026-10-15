import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { classifyBackendResponse } from './plugin-action-outcome.util';

const MIB = 1024 * 1024;
const invalid = expect.objectContaining({
  status: PluginActionExecutionStatus.FAILED,
  errorCode: 'BACKEND_INVALID_RESPONSE',
  errorMessage: expect.any(String),
});
const failure = (status: number, error: unknown) =>
  classifyBackendResponse(status, JSON.stringify({ error }));

describe('classifyBackendResponse', () => {
  describe('200', () => {
    it('succeeds with the result', () => {
      expect(classifyBackendResponse(200, JSON.stringify({ result: { count: 3 } }))).toEqual({
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: { count: 3 },
      });
    });

    it('accepts a null result', () => {
      expect(classifyBackendResponse(200, '{"result":null}')).toEqual({
        status: PluginActionExecutionStatus.SUCCEEDED,
        result: null,
      });
    });

    it('refuses a result that was undefined, which JSON drops', () => {
      expect(classifyBackendResponse(200, JSON.stringify({ result: undefined }))).toEqual(invalid);
    });

    it('accepts a result of exactly 1 MiB', () => {
      const result = 'x'.repeat(MIB - 2);
      expect(classifyBackendResponse(200, JSON.stringify({ result }))).toEqual({
        status: PluginActionExecutionStatus.SUCCEEDED,
        result,
      });
    });

    it('refuses a result one byte over 1 MiB', () => {
      expect(classifyBackendResponse(200, JSON.stringify({ result: 'x'.repeat(MIB - 1) }))).toEqual(
        invalid
      );
    });

    it.each(['<html></html>', '{"data":1}', '[1]', '"result"', ''])('refuses the body %p', body => {
      expect(classifyBackendResponse(200, body)).toEqual(invalid);
    });

    const nested = (depth: number) => `{"result":${'['.repeat(depth)}${']'.repeat(depth)}}`;

    it('accepts a result nested 100 levels deep', () => {
      expect(classifyBackendResponse(200, nested(100))).toMatchObject({
        status: PluginActionExecutionStatus.SUCCEEDED,
      });
    });

    it('refuses a result nested 101 levels deep', () => {
      expect(classifyBackendResponse(200, nested(101))).toEqual({
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'BACKEND_INVALID_RESPONSE',
        errorMessage: 'The result is nested deeper than 100 levels',
      });
    });
  });

  it('refuses a body that was over the read cap', () => {
    expect(classifyBackendResponse(200, null)).toEqual(invalid);
  });

  it.each([201, 202, 204, 299])('refuses %i', status => {
    expect(classifyBackendResponse(status, JSON.stringify({ result: 1 }))).toEqual(invalid);
  });

  it.each([301, 302, 307, 308])('refuses the redirect %i', status => {
    expect(classifyBackendResponse(status, '')).toEqual(
      expect.objectContaining({
        errorCode: 'BACKEND_INVALID_RESPONSE',
        errorMessage: `The backend answered ${status}`,
      })
    );
  });

  describe('non-2xx', () => {
    it('keeps the plugin error code and message', () => {
      expect(failure(500, { code: 'DOC_LOCKED', message: 'Document is locked' })).toEqual({
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'DOC_LOCKED',
        errorMessage: 'Document is locked',
      });
    });

    it('cuts a 5,000-character message to exactly 1,000', () => {
      const outcome = failure(400, { code: 'TOO_LONG', message: 'm'.repeat(5000) });

      expect(outcome).toMatchObject({ errorCode: 'TOO_LONG' });
      expect(outcome.status === PluginActionExecutionStatus.FAILED && outcome.errorMessage).toBe(
        'm'.repeat(1000)
      );
    });

    it.each([
      [42, '42'],
      [{ text: 'x' }, '[object Object]'],
      [null, ''],
      [undefined, ''],
    ])('stores the message %p as the string %p', (message, stored) => {
      expect(failure(400, { code: 'BAD_THING', message })).toEqual({
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'BAD_THING',
        errorMessage: stored,
      });
    });

    it.each(['not_upper', 'BACKEND_X', 'CANCELLED', 'TIMED_OUT', `A${'B'.repeat(64)}`, 7])(
      'refuses the code %p',
      code => {
        expect(failure(500, { code, message: 'x' })).toEqual(invalid);
      }
    );

    it.each(['Service Unavailable', '{"error":"BROKEN"}', '{"code":"BROKEN"}'])(
      'refuses an error body without an error object: %p',
      body => {
        expect(classifyBackendResponse(503, body)).toEqual(invalid);
      }
    );
  });

  describe('valid JSON that cannot be read', () => {
    const unreadable = {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: 'BACKEND_INVALID_RESPONSE',
      errorMessage: 'The backend answer could not be read',
    };

    it('refuses an error message with no primitive value', () => {
      const body = '{"error":{"code":"X","message":{"toString":1}}}';
      expect(classifyBackendResponse(500, body)).toEqual(unreadable);
    });

    it('refuses a result nested too deep to measure, saying so', () => {
      const depth = 50_000;
      const body = `{"result":${'['.repeat(depth)}${']'.repeat(depth)}}`;
      expect(classifyBackendResponse(200, body)).toEqual({
        ...unreadable,
        errorMessage: 'The result is nested deeper than 100 levels',
      });
    });
  });
});
