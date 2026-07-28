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

describe('_logFailure', () => {
  const capture = () => {
    const errors = [];
    const warnings = [];
    const logs = [];
    return {
      errors,
      warnings,
      logs,
      self: {
        config: {
          logError: m => errors.push(m),
          addWarningToCurrentStatus: m => warnings.push(m),
          logMessage: m => logs.push(m),
        },
      },
    };
  };

  it('reports a genuine failure on the error channel so it is still alerted on', () => {
    // These paths swallow the error to keep other advertisers importing, so an
    // informational log would leave a real failure with no alert and no trace.
    const { errors, warnings, logs, self } = capture();
    connectorProto._logFailure.call(
      self,
      'Error fetching ad_insights',
      new Error('remote or network error')
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('remote or network error');
    expect(errors[0]).toContain('at ');
    expect(warnings).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it('reports a customer-actionable failure as a warning, without a stack', () => {
    const { errors, warnings, self } = capture();
    const error = Object.assign(new Error('TikTok API error: No permission'), { isWarning: true });
    connectorProto._logFailure.call(self, 'Error fetching ad_insights', error);

    expect(warnings).toEqual(['Error fetching ad_insights: TikTok API error: No permission']);
    expect(errors).toHaveLength(0);
  });
});

describe('storage failures and advertiser success', () => {
  const buildConnector = saveData => {
    const self = Object.create(connectorProto);
    self.advertiserErrors = new Map();
    self.advertiserSuccesses = new Map();
    self.config = {
      logMessage: () => {},
      logError: () => {},
      addWarningToCurrentStatus: () => {},
      CreateEmptyTables: { value: true },
    };
    self.source = { fetchData: async () => [{ id: 1 }] };
    self.addMissingFieldsToData = data => data;
    self.getStorageByNode = async () => ({ saveData });
    return self;
  };

  it('does not mark an advertiser successful when its storage write failed', async () => {
    const self = buildConnector(async () => {
      throw new Error('BigQuery write failed');
    });

    await connectorProto.startImportProcessOfCatalogData.call(self, 'campaign', ['a'], ['id']);

    expect(self.advertiserSuccesses.get('a')).toBeUndefined();
    // Every advertiser failed, so the run must not report success
    expect(() => connectorProto._checkAndReportErrors.call(self, ['a'])).toThrow(
      /All advertisers failed/
    );
  });

  it('marks an advertiser successful when the write completes', async () => {
    const self = buildConnector(async () => undefined);

    await connectorProto.startImportProcessOfCatalogData.call(self, 'campaign', ['a'], ['id']);

    expect(self.advertiserSuccesses.get('a')).toBe(true);
    expect(() => connectorProto._checkAndReportErrors.call(self, ['a'])).not.toThrow();
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

  // A single advertiser can record several errors: a permission warning from the fetch
  // and a genuine storage failure afterwards. Order must not decide the classification.
  it.each([
    ['warning first', true],
    ['warning second', false],
  ])(
    'keeps the aggregate an error on mixed errors for one advertiser (%s)',
    (_label, warnFirst) => {
      const warning = Object.assign(new Error('No permission'), { isWarning: true });
      const real = new Error('remote or network error');
      const self = failAll({ a: warnFirst ? [warning, real] : [real, warning] });
      const error = (() => {
        try {
          connectorProto._checkAndReportErrors.call(self, ['a']);
        } catch (e) {
          return e;
        }
      })();
      expect(error.isWarning).toBe(false);
    }
  );

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
