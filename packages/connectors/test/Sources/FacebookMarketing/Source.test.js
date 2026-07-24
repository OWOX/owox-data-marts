import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const httpConstantsPath = path.join(__dirname, '../../../src/Constants/HttpConstants.js');
const errorCodesPath = path.join(
  __dirname,
  '../../../src/Sources/FacebookMarketing/Constants/ErrorCodes.js'
);
const coreSourcePath = path.join(__dirname, '../../../src/Core/AbstractSource.js');
const sourcePath = path.join(__dirname, '../../../src/Sources/FacebookMarketing/Source.js');

loadGasClass(httpConstantsPath);
loadGasClass(errorCodesPath);
loadGasClass(coreSourcePath);
loadGasClass(sourcePath);
const proto = globalThis.FacebookMarketingSource.prototype;

describe('_isAuthError', () => {
  it('flags Facebook OAuthException errors even though they come back as HTTP 400', () => {
    const error = {
      statusCode: 400,
      payload: { error: { code: 190, type: 'OAuthException', message: 'Session has expired' } },
    };
    expect(proto._isAuthError.call(null, error)).toBe(true);
  });

  it('still falls back to the default 401/403 check for non-Facebook-shaped errors', () => {
    expect(proto._isAuthError.call(null, { statusCode: 401 })).toBe(true);
  });

  it('does not flag a non-OAuth Facebook error (reduce-data, code 1 without type)', () => {
    const error = {
      statusCode: 400,
      payload: {
        error: { code: 1, message: "Please reduce the amount of data you're asking for" },
      },
    };
    expect(proto._isAuthError.call(null, error)).toBe(false);
  });

  it('does not flag a plain server error', () => {
    expect(proto._isAuthError.call(null, { statusCode: 500 })).toBe(false);
  });
});
