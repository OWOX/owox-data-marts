import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const httpConstantsPath = path.join(__dirname, '../../src/Constants/HttpConstants.js');
const coreSourcePath = path.join(__dirname, '../../src/Core/AbstractSource.js');

// HTTP_STATUS is referenced inside _isAuthError's method body, so it only needs to be
// real by call time, not by load time — but loading the real file (not a hand-stub)
// keeps the test honest against the actual status codes AbstractSource checks.
loadGasClass(httpConstantsPath);
loadGasClass(coreSourcePath);
const proto = globalThis.AbstractSource.prototype;

describe('_isAuthError', () => {
  it.each([
    [401, true],
    [403, true],
    [400, false],
    [500, false],
    [undefined, false],
  ])('statusCode %s -> %s', (statusCode, expected) => {
    expect(proto._isAuthError.call(null, { statusCode })).toBe(expected);
  });
});

// urlFetchWithRetry classifies on the way out, but a source can classify below it with
// far more context — a payload-level permission error carries no status code, so
// recomputing from scratch here would silently clear it and page on-call again.
describe('urlFetchWithRetry warning classification', () => {
  const failWith = async error => {
    globalThis.HttpUtils = {
      fetch: async () => {
        throw error;
      },
    };
    const self = Object.assign(Object.create(proto), {
      // A single attempt: _shouldRetry returns false immediately, so the throw path runs
      config: { MaxFetchRetries: { value: 1 }, logMessage: () => {} },
    });
    return proto.urlFetchWithRetry.call(self, 'https://example.test', {}).catch(e => e);
  };

  it('keeps a warning flag set by a deeper layer', async () => {
    const thrown = await failWith(
      Object.assign(new Error('No permission to operate advertiser'), { isWarning: true })
    );

    expect(thrown.isWarning).toBe(true);
  });

  it('still promotes an unflagged auth failure to a warning', async () => {
    const thrown = await failWith(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));

    expect(thrown.isWarning).toBe(true);
  });

  it('leaves an ordinary failure unflagged', async () => {
    const thrown = await failWith(Object.assign(new Error('Server error'), { statusCode: 500 }));

    expect(thrown.isWarning).toBe(false);
  });
});
