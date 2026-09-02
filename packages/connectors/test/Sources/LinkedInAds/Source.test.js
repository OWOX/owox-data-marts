import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

globalThis.CONFIG_ATTRIBUTES = new Proxy({}, { get: () => 'attr' });
globalThis.OAUTH_CONSTANTS = new Proxy({}, { get: () => 'oauth' });
globalThis.HttpUtils = { fetch: vi.fn() };
globalThis.HTTP_STATUS = { TOO_MANY_REQUESTS: 429, SERVER_ERROR_MIN: 500 };
globalThis.LinkedInAdsFieldsSchema = {};

loadGasClass(path.join(__dirname, '../../../src/Sources/LinkedInAds/Source.js'), {
  AbstractSource: class {},
});

const sourceProto = globalThis.LinkedInAdsSource.prototype;
const URN = '123456';

const buildSource = ({ makeRequest } = {}) => {
  const warnings = [];
  const self = new globalThis.LinkedInAdsSource({ mergeParameters: params => params });
  self.config = { addWarningToCurrentStatus: message => warnings.push(message) };
  self.makeRequest = makeRequest;

  return { self, warnings };
};

const linkedInDate = day => ({ year: 2026, month: 8, day });

const buildRow = (day, pivotValues, metrics = {}) => ({
  dateRange: { start: linkedInDate(day), end: linkedInDate(day) },
  pivotValues,
  ...metrics,
});

const buildFullDay = day => Array.from({ length: 15000 }, (_, i) => buildRow(day, [String(i)]));

describe('fetchAdAnalytics', () => {
  it('requests one day at a time so each response stays under the API element limit', async () => {
    const requestedUrls = [];
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async url => {
        requestedUrls.push(url);
        return { elements: [] };
      }),
    });

    await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 3),
      fields: ['impressions'],
    });

    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls[0]).toContain(
      'dateRange=(start:(year:2026,month:8,day:1),end:(year:2026,month:8,day:1))'
    );
    expect(requestedUrls[1]).toContain(
      'dateRange=(start:(year:2026,month:8,day:2),end:(year:2026,month:8,day:2))'
    );
    expect(requestedUrls[2]).toContain(
      'dateRange=(start:(year:2026,month:8,day:3),end:(year:2026,month:8,day:3))'
    );
    expect(warnings).toHaveLength(0);
  });

  it('merges field chunks across the per-day requests', async () => {
    const { self } = buildSource({
      makeRequest: vi.fn(async url => ({
        elements: [
          {
            dateRange: {
              start: { year: 2026, month: 8, day: 1 },
              end: { year: 2026, month: 8, day: 1 },
            },
            pivotValues: ['creative'],
            ...(url.includes('impressions') ? { impressions: 10 } : { clicks: 5 }),
          },
        ],
      })),
    });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const data = await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 1),
      fields: ['impressions', 'clicks'],
    });

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      impressions: 10,
      clicks: 5,
      dateRangeStart: '2026-08-01',
      dateRangeEnd: '2026-08-01',
    });
  });

  it('keeps rows with the same pivot from different days as separate rows', async () => {
    let requestCount = 0;
    const { self } = buildSource({
      makeRequest: vi.fn(async () => {
        requestCount += 1;
        return { elements: [buildRow(requestCount, ['creative'], { impressions: requestCount })] };
      }),
    });

    const data = await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 2),
      fields: ['impressions'],
    });

    expect(data.map(row => [row.dateRangeStart, row.impressions])).toEqual([
      ['2026-08-01', 1],
      ['2026-08-02', 2],
    ]);
  });

  it('warns with the affected day in YYYY-MM-DD format when a day response reaches the API element limit', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 1),
      fields: ['impressions'],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('15000');
    expect(warnings[0]).toContain(URN);
    expect(warnings[0]).toContain('1 day(s): 2026-08-01;');
  });

  it('lists at most 10 truncated days and counts the rest', async () => {
    let requestCount = 0;
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => {
        requestCount += 1;
        return { elements: buildFullDay(requestCount) };
      }),
    });

    await sourceProto.fetchAdAnalytics.call(self, URN, {
      startDate: new Date(2026, 7, 1),
      endDate: new Date(2026, 7, 12),
      fields: ['impressions'],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('12 day(s): 2026-08-01, 2026-08-02');
    expect(warnings[0]).toContain('2026-08-10 and 2 more;');
    expect(warnings[0]).not.toContain('2026-08-11');
  });
});

describe('mergeAnalyticsResults', () => {
  it('combines fields of rows with the same dateRange and pivotValues and appends the rest', () => {
    const existing = [
      buildRow(1, ['a'], { impressions: 1 }),
      buildRow(1, ['b'], { impressions: 2 }),
    ];
    const incoming = [buildRow(1, ['b'], { clicks: 20 }), buildRow(1, ['c'], { clicks: 30 })];

    const merged = sourceProto.mergeAnalyticsResults.call({}, existing, incoming);

    expect(merged).toEqual([
      buildRow(1, ['a'], { impressions: 1 }),
      buildRow(1, ['b'], { impressions: 2, clicks: 20 }),
      buildRow(1, ['c'], { clicks: 30 }),
    ]);
    expect(existing[1]).not.toHaveProperty('clicks');
  });
});

describe('makeRequest', () => {
  const buildAuthorizedSource = () => {
    const self = new globalThis.LinkedInAdsSource({ mergeParameters: params => params });
    self.config = {
      AuthType: {
        value: 'oauth2',
        items: {
          ClientId: { value: 'client-id' },
          ClientSecret: { value: 'client-secret' },
          RefreshToken: { value: 'refresh-token' },
        },
      },
    };
    self.urlFetchWithRetry = vi.fn(async () => ({ getContentText: async () => '{"elements":[]}' }));
    globalThis.OAuthUtils = {
      getAccessToken: vi.fn(async ({ config }) => {
        config.AccessToken = { value: 'access-token' };
        return 'access-token';
      }),
    };

    return self;
  };

  it('exchanges the refresh token once per run and reuses the access token', async () => {
    const self = buildAuthorizedSource();

    await sourceProto.makeRequest.call(
      self,
      'https://api.linkedin.com/rest/adAnalytics?q=statistics'
    );
    await sourceProto.makeRequest.call(self, 'https://api.linkedin.com/rest/adAccounts/1');

    expect(globalThis.OAuthUtils.getAccessToken).toHaveBeenCalledTimes(1);
    expect(self.urlFetchWithRetry).toHaveBeenCalledTimes(2);
    expect(self.urlFetchWithRetry.mock.calls[0][0]).toContain('&oauth2_access_token=access-token');
    expect(self.urlFetchWithRetry.mock.calls[1][0]).toContain('?oauth2_access_token=access-token');
  });

  it('throws when OAuth credentials are missing', async () => {
    const self = buildAuthorizedSource();
    self.config = { AuthType: { value: 'oauth2', items: {} } };

    await expect(
      sourceProto.makeRequest.call(self, 'https://api.linkedin.com/rest/adAccounts/1')
    ).rejects.toThrow('LinkedIn Ads OAuth credentials are not configured');
  });
});

describe('isValidToRetry', () => {
  it.each([
    [{ statusCode: 429 }, true],
    [{ statusCode: 503 }, true],
    [{}, true],
    [{ statusCode: 401 }, false],
    [{ statusCode: 400 }, false],
  ])('returns %s → %s', (error, expected) => {
    expect(sourceProto.isValidToRetry.call({}, error)).toBe(expected);
  });
});
