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
