import { describe, expect, it, vi } from 'vitest';
import { LinkedInAdsSource } from '../../../src/Sources/LinkedInAds/Source.js';

// The Source is an ES module on this branch, so it is imported rather than vm-evaluated.
// What it still resolves as bare runtime globals has to be supplied the same way the
// bundle supplies it in production.
globalThis.HTTP_STATUS = { TOO_MANY_REQUESTS: 429, SERVER_ERROR_MIN: 500 };
globalThis.LOG_LEVEL = { INFO: 'info', WARN: 'warn', ERROR: 'error' };
globalThis.DATE_STRATEGY = { DAY_BY_DAY: 'day-by-day', RANGE: 'range', NONE: 'none' };

const sourceProto = LinkedInAdsSource.prototype;
const URN = '123456';

/**
 * A Source on the real prototype without running the constructor, which would want a
 * context to register parameters against. Every method under test reads only what is set
 * here.
 */
const buildSource = ({ makeRequest, parameters = {} } = {}) => {
  const logs = [];
  const self = Object.assign(Object.create(sourceProto), {
    MAX_FIELDS_PER_REQUEST: 20,
    MAX_RESPONSE_ELEMENTS: 15000,
    BASE_URL: 'https://api.linkedin.com/rest/',
    context: {
      getParameter: name => parameters[name],
      log: (level, message) => logs.push({ level, message }),
    },
    makeRequest,
  });

  return { self, logs, warnings: () => logs.filter(l => l.level === 'warn').map(l => l.message) };
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
  sourceProto.fetchAdAnalytics.call(self, {
    urn: URN,
    fields,
    startDate: utcDay(day),
    endDate: utcDay(day),
  });

describe('getDateStrategy', () => {
  /**
   * The whole point of #1569: adAnalytics does not paginate and truncates at 15 000
   * elements, so a whole window in one request silently loses rows. RANGE here is a data
   * bug, not a pacing preference.
   */
  it('fetches analytics day by day so no response can span days', () => {
    expect(sourceProto.getDateStrategy.call({}, 'adAnalytics')).toBe('day-by-day');
  });
});

describe('fetchAdAnalytics', () => {
  it('requests exactly the given day and says nothing under the element limit', async () => {
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
    expect(warnings()).toHaveLength(0);
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

  /**
   * Reaching the cap on a SINGLE day means the day really is bigger than LinkedIn will
   * hand over, which is rare enough to be worth naming outright — main batched this per
   * account because its connector owned the day loop; here the engine does, so the Source
   * reports each occurrence as it sees it.
   */
  it('warns, naming the account and the day, when a response reaches the element limit', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain(URN);
    expect(warnings()[0]).toContain('15000');
    expect(warnings()[0]).toContain('2026-08-01');
  });

  it('still returns the rows it did get when a day was truncated', async () => {
    const { self } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    const data = await fetchDay(self, 1);

    expect(data).toHaveLength(15000);
  });

  it('warns once per truncated day across calls', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);
    await fetchDay(self, 2);

    expect(warnings()).toHaveLength(2);
    expect(warnings()[1]).toContain('2026-08-02');
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

  // Each field chunk is merged into up to a full day of rows, so a quadratic merge takes minutes.
  it('merges a day at the element limit in well under a second', () => {
    const existing = buildFullDay(1).map(row => ({ ...row, impressions: 1 }));
    const incoming = buildFullDay(1).map(row => ({ ...row, clicks: 2 }));

    const startedAt = performance.now();
    const merged = sourceProto.mergeAnalyticsResults.call({}, existing, incoming);
    const elapsedMs = performance.now() - startedAt;

    expect(merged).toHaveLength(15000);
    expect(merged.every(row => row.impressions === 1 && row.clicks === 2)).toBe(true);
    expect(elapsedMs).toBeLessThan(1000);
  });
});

describe('makeRequest', () => {
  const buildAuthorizedSource = (
    items = {
      ClientId: { value: 'client-id' },
      ClientSecret: { value: 'client-secret' },
      RefreshToken: { value: 'refresh-token' },
    }
  ) => {
    const { self } = buildSource({
      parameters: { AuthType: { value: 'oauth2', items } },
    });
    self.urlFetchWithRetry = vi.fn(async () => ({ text: async () => '{"elements":[]}' }));
    globalThis.OAuthUtils = { getAccessToken: vi.fn(async () => 'access-token') };

    return self;
  };

  /**
   * Day-by-day analytics multiply the request count, so a token exchange per request would
   * mean one per day per account. The cache is what keeps that at one per run.
   */
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
    const self = buildAuthorizedSource({});

    await expect(
      sourceProto.makeRequest.call(self, 'https://api.linkedin.com/rest/adAccounts/1')
    ).rejects.toThrow('LinkedIn Ads OAuth credentials are not configured');
  });
});

describe('isValidToRetry', () => {
  /**
   * Without this the AbstractSource default refuses every retry, so one 429 in the middle
   * of a long backfill failed the whole run.
   */
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
