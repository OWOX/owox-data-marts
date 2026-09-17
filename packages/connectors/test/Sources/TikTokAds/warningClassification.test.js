import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../../src/Sources/TikTokAds/TiktokMarketingApiProvider.js'));

// Upstream this file also covered TikTokAdsConnector's per-advertiser failure
// reporting and its "every advertiser failed with a warning" aggregation. There
// is no per-connector Connector class here: the universal Core/AbstractConnector
// is fail-fast, so the first account error ends the run and reaches
// connector-runner's handler as a single error. What survives is the
// classification below, which decides whether that error is a warning.
//
// The provider is a plain `class X {}` declaration — a global *lexical* binding,
// reachable from another in-context script but not as a globalThis property.
const TiktokMarketingApiProvider = vm.runInThisContext('TiktokMarketingApiProvider');
const provider = new TiktokMarketingApiProvider('app', 'token', 'secret');

// The provider calls global fetch directly rather than going through HttpUtils.
const stubApiResponse = json => {
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify(json),
  });
};

describe('makeRequest error classification', () => {
  it('flags permission errors as warnings', async () => {
    stubApiResponse({ code: 40001, message: 'No permission to operate advertiser: 123' });
    const error = await provider.makeRequest({ url: 'x', method: 'GET' }).catch(e => e);
    expect(error.message).toContain('No permission to operate advertiser');
    expect(error.isWarning).toBe(true);
  });

  it('flags deleted-advertiser errors as warnings', async () => {
    stubApiResponse({
      code: 40002,
      message: "The advertiser 123 doesn't exist or has been deleted.",
    });
    const error = await provider.makeRequest({ url: 'x', method: 'GET' }).catch(e => e);
    expect(error.isWarning).toBe(true);
  });

  it('does not flag other API errors as warnings', async () => {
    stubApiResponse({ code: 50000, message: 'remote or network error' });
    const error = await provider.makeRequest({ url: 'x', method: 'GET' }).catch(e => e);
    expect(error.isWarning).toBe(false);
  });
});
