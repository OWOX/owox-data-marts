import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../../src/Sources/TikTokAds/TiktokMarketingApiProvider.js'));
loadGasClass(path.join(__dirname, '../../../src/Sources/TikTokAds/Connector.js'), {
  AbstractConnector: class {},
});

// The provider is a plain `class X {}` declaration — a global *lexical* binding,
// reachable from another in-context script but not as a globalThis property.
const TiktokMarketingApiProvider = vm.runInThisContext('TiktokMarketingApiProvider');
const provider = new TiktokMarketingApiProvider('app', 'token', 'secret');
const connectorProto = globalThis.TikTokAdsConnector.prototype;

const stubApiResponse = json => {
  globalThis.HttpUtils = {
    fetch: async () => ({
      getResponseCode: () => 200,
      getContentText: async () => JSON.stringify(json),
    }),
  };
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

describe('_checkAndReportErrors aggregate classification', () => {
  const failAll = errorsById => ({
    advertiserErrors: new Map(Object.entries(errorsById)),
    advertiserSuccesses: new Map(),
  });

  it('marks the aggregate as a warning when every advertiser failed with a warning', () => {
    const self = failAll({
      a: [Object.assign(new Error('TikTok API error: No permission'), { isWarning: true })],
      b: [Object.assign(new Error('TikTok API error: No permission'), { isWarning: true })],
    });
    const error = (() => {
      try {
        connectorProto._checkAndReportErrors.call(self, ['a', 'b']);
      } catch (e) {
        return e;
      }
    })();
    expect(error.message).toContain('All advertisers failed');
    expect(error.isWarning).toBe(true);
  });

  it('keeps the aggregate an error when any advertiser failed for another reason', () => {
    const self = failAll({
      a: [Object.assign(new Error('TikTok API error: No permission'), { isWarning: true })],
      b: [new Error('remote or network error')],
    });
    const error = (() => {
      try {
        connectorProto._checkAndReportErrors.call(self, ['a', 'b']);
      } catch (e) {
        return e;
      }
    })();
    expect(error.isWarning).toBe(false);
  });
});
