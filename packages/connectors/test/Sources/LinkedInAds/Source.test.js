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

// Run dates are UTC midnight (see AbstractConnector), so tests use the same shape.
const utcDay = day => new Date(Date.UTC(2026, 7, day));

const linkedInDate = day => ({ year: 2026, month: 8, day });

const buildRow = (day, pivotValues, metrics = {}) => ({
  dateRange: { start: linkedInDate(day), end: linkedInDate(day) },
  pivotValues,
  ...metrics,
});

const buildFullDay = day => Array.from({ length: 15000 }, (_, i) => buildRow(day, [String(i)]));

const fetchDay = (self, day, fields = ['impressions']) =>
  sourceProto.fetchAdAnalytics.call(self, URN, {
    startDate: utcDay(day),
    endDate: utcDay(day),
    fields,
  });

describe('fetchAdAnalytics', () => {
  it('requests exactly the given day and records nothing under the element limit', async () => {
    const requestedUrls = [];
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async url => {
        requestedUrls.push(url);
        return { elements: [] };
      }),
    });

    await fetchDay(self, 1);

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain(
      'dateRange=(start:(year:2026,month:8,day:1),end:(year:2026,month:8,day:1))'
    );
    expect(warnings).toHaveLength(0);
    expect(self.truncatedAnalyticsDays).toEqual({});
  });

  it('merges field chunks into single rows', async () => {
    const { self } = buildSource({
      makeRequest: vi.fn(async url => ({
        elements: [
          buildRow(
            1,
            ['creative'],
            url.includes('impressions') ? { impressions: 10 } : { clicks: 5 }
          ),
        ],
      })),
    });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const data = await fetchDay(self, 1, ['impressions', 'clicks']);

    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      impressions: 10,
      clicks: 5,
      dateRangeStart: '2026-08-01',
      dateRangeEnd: '2026-08-01',
    });
  });

  it('records a day whose response reaches the element limit instead of warning per call', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);

    expect(warnings).toHaveLength(0);
    expect(self.truncatedAnalyticsDays).toEqual({ [URN]: ['2026-08-01'] });
  });

  it('accumulates truncated days per account across calls', async () => {
    const { self } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);
    await fetchDay(self, 2);

    expect(self.truncatedAnalyticsDays).toEqual({ [URN]: ['2026-08-01', '2026-08-02'] });
  });
});

describe('buildTruncationWarning', () => {
  it('names the account, the limit and the day', () => {
    const warning = sourceProto.buildTruncationWarning.call(buildSource().self, URN, [
      '2026-08-01',
    ]);

    expect(warning).toContain('15000');
    expect(warning).toContain(URN);
    expect(warning).toContain('1 day(s): 2026-08-01;');
  });

  it('lists at most 10 days and counts the rest', () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);

    const warning = sourceProto.buildTruncationWarning.call(buildSource().self, URN, days);

    expect(warning).toContain('12 day(s): 2026-08-01, 2026-08-02');
    expect(warning).toContain('2026-08-10 and 2 more;');
    expect(warning).not.toContain('2026-08-11');
  });
});

describe('formatDateForUrl', () => {
  it('reads the UTC date so the request names the same day as the UTC cursor on any runner', () => {
    // 23:30Z on Jul 31 is already Aug 1 in local time on a UTC+ runner.
    const formatted = sourceProto.formatDateForUrl.call(
      sourceProto,
      new Date('2026-07-31T23:30:00Z')
    );

    expect(formatted).toBe('(year:2026,month:7,day:31)');
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
