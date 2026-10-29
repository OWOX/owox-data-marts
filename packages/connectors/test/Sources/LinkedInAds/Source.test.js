import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';
import { LinkedInAdsSource } from '../../../src/Sources/LinkedInAds/Source.js';

// The Source is an ES module on this branch, so it is imported rather than vm-evaluated.
// What it still resolves as bare runtime globals has to be supplied the same way the
// bundle supplies it in production.
globalThis.HTTP_STATUS = { TOO_MANY_REQUESTS: 429, SERVER_ERROR_MIN: 500 };
globalThis.LOG_LEVEL = { INFO: 'info', WARN: 'warn', ERROR: 'error' };
globalThis.DATE_STRATEGY = { DAY_BY_DAY: 'day-by-day', RANGE: 'range', NONE: 'none' };

// The field references are GAS-style scripts that declare globals with `var`, in the order
// the bundle puts them: field files first, the schema that reads them last.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiReferenceDir = path.join(
  __dirname,
  '../../../src/Sources/LinkedInAds/LinkedInAdsAPIReference'
);
loadGasClass(path.join(__dirname, '../../../src/Constants/DataTypes.js'));
for (const file of [
  'adAccountFields.js',
  'adCampaignGroupFields.js',
  'adCampaignFields.js',
  'creativesFields.js',
  'adAnalyticsFields.js',
  'adAnalyticsByGeoFields.js',
  'LinkedInAdsFieldsSchema.js',
]) {
  loadGasClass(path.join(apiReferenceDir, file));
}
const fieldsSchema = globalThis.LinkedInAdsFieldsSchema;

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
    MAX_TRUNCATED_DAYS_IN_WARNING: 10,
    truncatedAnalyticsDays: new Map(),
    GEO_NAMES_PER_REQUEST: 50,
    geoNames: new Map(),
    geoNamesUnavailable: false,
    fieldsSchema,
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
   * hand over, which is worth naming outright. It is named once the account completes, as
   * main did: every WARN line becomes one of the run's warnings, so one per day buried a
   * long backfill of a saturated account.
   */
  it('warns, naming the account and the day, when a response reaches the element limit', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);
    expect(warnings()).toHaveLength(0);
    sourceProto.onAccountComplete.call(self, { id: URN });

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

  it('warns once per account, naming every truncated day', async () => {
    const { self, warnings } = buildSource({
      makeRequest: vi.fn(async () => ({ elements: buildFullDay(1) })),
    });

    await fetchDay(self, 1);
    await fetchDay(self, 2);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('2026-08-01, 2026-08-02');
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

const GEO_NODES = [
  ['adAnalyticsByCountry', 'MEMBER_COUNTRY_V2', 'country'],
  ['adAnalyticsByRegion', 'MEMBER_REGION_V2', 'region'],
  ['adAnalyticsByCounty', 'MEMBER_COUNTY', 'county'],
];

describe('geo breakdown nodes', () => {
  it.each(GEO_NODES)('%s offers its location, the campaign and the metrics', (node, pivot, geo) => {
    const schema = fieldsSchema[node];
    const fieldNames = Object.keys(schema.fields);

    expect(schema.geoPivot).toBe(pivot);
    expect(schema.geoField).toBe(geo);
    expect(schema.isTimeSeries).toBe(true);
    expect(fieldNames).toEqual(
      expect.arrayContaining(['account', 'campaign', geo, `${geo}Name`, 'costInLocalCurrency'])
    );
    expect(schema.uniqueKeys.every(key => fieldNames.includes(key))).toBe(true);
    expect(schema.defaultFields.every(field => fieldNames.includes(field))).toBe(true);
  });

  /**
   * LinkedIn answers these only for non-member pivots, and every geo breakdown is a member
   * pivot; pivotValues is replaced by the account, campaign and location columns.
   */
  it.each(GEO_NODES)('%s leaves out what a member pivot does not return', node => {
    for (const field of [
      'pivotValues',
      'approximateMemberReach',
      'audiencePenetration',
      'cardClicks',
      'cardImpressions',
      'viralCardClicks',
      'viralCardImpressions',
      'conversionValueInLocalCurrency',
    ]) {
      expect(fieldsSchema[node].fields).not.toHaveProperty(field);
    }
  });

  it('writes each breakdown to its own table', () => {
    const destinations = GEO_NODES.map(([node]) => fieldsSchema[node].destinationName);

    expect(new Set([...destinations, fieldsSchema.adAnalytics.destinationName]).size).toBe(4);
  });
});

describe('fetchAdAnalyticsByGeo', () => {
  const CAMPAIGN_1 = 'urn:li:sponsoredCampaign:1';
  const CAMPAIGN_2 = 'urn:li:sponsoredCampaign:2';
  const US = 'urn:li:geo:103644278';
  const DE = 'urn:li:geo:101282230';

  const geoRow = (day, geoUrn, metrics) => buildRow(day, [geoUrn], metrics);

  /**
   * A LinkedIn stand-in that answers by request: the day's campaigns, the geo breakdown of
   * one campaign, and location names.
   */
  const buildLinkedIn = ({
    campaigns = [CAMPAIGN_1, CAMPAIGN_2],
    rowsByCampaign = {
      [CAMPAIGN_1]: day => [geoRow(day, US, { impressions: 10, costInLocalCurrency: '1.5' })],
      [CAMPAIGN_2]: day => [
        geoRow(day, US, { impressions: 20, costInLocalCurrency: '2.5' }),
        geoRow(day, DE, { impressions: 5, costInLocalCurrency: '0.5' }),
      ],
    },
    names = { [US]: 'United States', [DE]: 'Germany' },
    namesFail = false,
  } = {}) => {
    const requests = [];
    const makeRequest = vi.fn(async url => {
      requests.push(url);
      const decoded = decodeURIComponent(url);
      const day = Number(/start:\(year:\d+,month:\d+,day:(\d+)\)/.exec(url)?.[1]);

      if (url.includes('adTargetingEntities')) {
        if (namesFail) throw new Error('HTTP 403: Not enough permissions');
        return {
          elements: Object.entries(names)
            .filter(([urn]) => decoded.includes(urn))
            .map(([urn, name]) => ({ urn, name, facetUrn: 'urn:li:adTargetingFacet:locations' })),
        };
      }
      if (url.includes('pivot=CAMPAIGN&')) {
        return { elements: campaigns.map(urn => ({ pivotValues: [urn], impressions: 1 })) };
      }
      const campaign = Object.keys(rowsByCampaign).find(urn => decoded.includes(`List(${urn})`));
      return { elements: campaign ? rowsByCampaign[campaign](day) : [] };
    });
    return { makeRequest, requests };
  };

  const fetchGeoDay = (self, day, nodeName = 'adAnalyticsByCountry', fields) =>
    sourceProto.fetchAdAnalyticsByGeo.call(self, {
      nodeName,
      urn: URN,
      fields: fields ?? [
        'dateRangeStart',
        'dateRangeEnd',
        'account',
        'campaign',
        fieldsSchema[nodeName].geoField,
        `${fieldsSchema[nodeName].geoField}Name`,
        'impressions',
        'costInLocalCurrency',
      ],
      startDate: utcDay(day),
      endDate: utcDay(day),
    });

  it('returns a row per campaign and country, with the country name', async () => {
    const { makeRequest } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    const rows = await fetchGeoDay(self, 1);

    expect(rows).toEqual([
      {
        account: `urn:li:sponsoredAccount:${URN}`,
        campaign: CAMPAIGN_1,
        country: US,
        countryName: 'United States',
        dateRangeStart: '2026-08-01',
        dateRangeEnd: '2026-08-01',
        impressions: 10,
        costInLocalCurrency: '1.5',
      },
      {
        account: `urn:li:sponsoredAccount:${URN}`,
        campaign: CAMPAIGN_2,
        country: US,
        countryName: 'United States',
        dateRangeStart: '2026-08-01',
        dateRangeEnd: '2026-08-01',
        impressions: 20,
        costInLocalCurrency: '2.5',
      },
      {
        account: `urn:li:sponsoredAccount:${URN}`,
        campaign: CAMPAIGN_2,
        country: DE,
        countryName: 'Germany',
        dateRangeStart: '2026-08-01',
        dateRangeEnd: '2026-08-01',
        impressions: 5,
        costInLocalCurrency: '0.5',
      },
    ]);
  });

  /**
   * LinkedIn takes a member pivot only from the analytics finder, alone, so the campaign
   * can only come from narrowing each request to one campaign.
   */
  it('asks the analytics finder for the member pivot, one campaign per request', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchGeoDay(self, 1, 'adAnalyticsByRegion');

    const geoRequests = requests.filter(url => url.includes('pivot=MEMBER_REGION_V2'));
    expect(geoRequests).toHaveLength(2);
    expect(geoRequests[0]).toContain('adAnalytics?q=analytics&');
    expect(geoRequests[0]).toContain('&timeGranularity=DAILY');
    expect(geoRequests[0]).toContain(`&campaigns=List(${encodeURIComponent(CAMPAIGN_1)})`);
    expect(geoRequests[1]).toContain(`&campaigns=List(${encodeURIComponent(CAMPAIGN_2)})`);
    // The account, campaign and location columns are filled by the connector, not asked for.
    const fields = new URL(geoRequests[0]).searchParams.get('fields').split(',');
    expect(fields).toEqual(['dateRange', 'pivotValues', 'impressions', 'costInLocalCurrency']);
  });

  it('reads the campaigns of an account and day once for every geo node', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchGeoDay(self, 1, 'adAnalyticsByCountry');
    await fetchGeoDay(self, 1, 'adAnalyticsByRegion');
    await fetchGeoDay(self, 1, 'adAnalyticsByCounty');
    await fetchGeoDay(self, 2, 'adAnalyticsByCountry');

    const campaignRequests = requests.filter(url => url.includes('pivot=CAMPAIGN&'));
    expect(campaignRequests).toHaveLength(2);
    expect(campaignRequests[0]).toContain('&timeGranularity=ALL');
    expect(campaignRequests[0]).toContain(
      `&accounts=List(${encodeURIComponent(`urn:li:sponsoredAccount:${URN}`)})`
    );
  });

  it('asks nothing more on a day without campaigns', async () => {
    const { makeRequest, requests } = buildLinkedIn({ campaigns: [] });
    const { self } = buildSource({ makeRequest });

    expect(await fetchGeoDay(self, 1)).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('merges field chunks of one campaign into single rows', async () => {
    const { makeRequest } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => [geoRow(day, US, { impressions: 10, clicks: 3 })],
      },
    });
    const { self } = buildSource({ makeRequest });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const rows = await fetchGeoDay(self, 1, 'adAnalyticsByCountry', [
      'dateRangeStart',
      'dateRangeEnd',
      'campaign',
      'country',
      'impressions',
      'clicks',
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaign: CAMPAIGN_1,
      country: US,
      impressions: 10,
      clicks: 3,
    });
  });

  it('looks each location name up once per run', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchGeoDay(self, 1);
    await fetchGeoDay(self, 2);

    const nameRequests = requests.filter(url => url.includes('adTargetingEntities'));
    expect(nameRequests).toHaveLength(1);
    expect(nameRequests[0]).toBe(
      'https://api.linkedin.com/rest/adTargetingEntities?q=urns&queryVersion=QUERY_USES_URNS' +
        `&urns=List(${encodeURIComponent(US)},${encodeURIComponent(DE)})` +
        '&locale=(language:en,country:US)'
    );
  });

  it('asks for at most GEO_NAMES_PER_REQUEST names at a time', async () => {
    const geoUrns = Array.from({ length: 5 }, (_, i) => `urn:li:geo:${i + 1}`);
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => geoUrns.map(urn => geoRow(day, urn, {})) },
      names: {},
    });
    const { self } = buildSource({ makeRequest });
    self.GEO_NAMES_PER_REQUEST = 2;

    await fetchGeoDay(self, 1);

    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(3);
  });

  it('leaves a location LinkedIn does not name empty, and does not ask for it again', async () => {
    const { makeRequest, requests } = buildLinkedIn({ names: { [US]: 'United States' } });
    const { self } = buildSource({ makeRequest });

    const rows = await fetchGeoDay(self, 1);
    await fetchGeoDay(self, 2);

    expect(rows.find(row => row.country === DE).countryName).toBeNull();
    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(1);
  });

  /**
   * Names are a convenience on top of the metrics: when LinkedIn will not give them, the
   * metrics and location URNs still load, and one warning says the names are missing.
   */
  it('imports the metrics without names when the name lookup fails, warning once', async () => {
    const { makeRequest, requests } = buildLinkedIn({ namesFail: true });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchGeoDay(self, 1);
    await fetchGeoDay(self, 2);

    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.country && row.countryName === null)).toBe(true);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('HTTP 403: Not enough permissions');
    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(1);
  });

  it('is what fetchData runs for a geo node', async () => {
    const { makeRequest } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    const rows = await sourceProto.fetchData.call(self, {
      nodeName: 'adAnalyticsByCountry',
      fields: fieldsSchema.adAnalyticsByCountry.uniqueKeys,
      accountId: URN,
      startDate: utcDay(1),
      endDate: utcDay(1),
    });

    expect(rows).toHaveLength(3);
  });
});
