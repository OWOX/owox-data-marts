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
  'adAnalyticsByMemberFields.js',
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
    NAMES_PER_REQUEST: 50,
    memberNames: new Map(),
    memberNamesUnavailable: false,
    memberNamesRejected: false,
    CAMPAIGN_ACTIVITY_FIELDS: ['impressions', 'clicks', 'costInLocalCurrency'],
    accountsWithIssues: new Set(),
    memberGaps: new Map(),
    MAX_URNS_IN_WARNING: 5,
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

  it('asks the statistics finder for creative, campaign, group and account rows', async () => {
    const requestedUrls = [];
    const { self } = buildSource({
      makeRequest: vi.fn(async url => {
        requestedUrls.push(url);
        return { elements: [] };
      }),
    });

    await fetchDay(self, 1);

    expect(requestedUrls).toEqual([
      'https://api.linkedin.com/rest/adAnalytics?q=statistics' +
        '&dateRange=(start:(year:2026,month:8,day:1),end:(year:2026,month:8,day:1))' +
        '&pivots=List(CREATIVE,CAMPAIGN,CAMPAIGN_GROUP,ACCOUNT)&timeGranularity=DAILY' +
        `&accounts=List(${encodeURIComponent(`urn:li:sponsoredAccount:${URN}`)})` +
        '&fields=dateRange,pivotValues,impressions',
    ]);
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

const MEMBER_NODES = [
  ['adAnalyticsByCountry', 'MEMBER_COUNTRY_V2', 'country', 'linkedin_ads_ad_analytics_by_country'],
  ['adAnalyticsByRegion', 'MEMBER_REGION_V2', 'region', 'linkedin_ads_ad_analytics_by_region'],
  ['adAnalyticsByCounty', 'MEMBER_COUNTY', 'county', 'linkedin_ads_ad_analytics_by_county'],
  ['adAnalyticsByCompany', 'MEMBER_COMPANY', 'company', 'linkedin_ads_ad_analytics_by_company'],
  [
    'adAnalyticsByJobTitle',
    'MEMBER_JOB_TITLE',
    'jobTitle',
    'linkedin_ads_ad_analytics_by_job_title',
  ],
  [
    'adAnalyticsBySeniority',
    'MEMBER_SENIORITY',
    'seniority',
    'linkedin_ads_ad_analytics_by_seniority',
  ],
  [
    'adAnalyticsByJobFunction',
    'MEMBER_JOB_FUNCTION',
    'jobFunction',
    'linkedin_ads_ad_analytics_by_job_function',
  ],
  ['adAnalyticsByIndustry', 'MEMBER_INDUSTRY', 'industry', 'linkedin_ads_ad_analytics_by_industry'],
  [
    'adAnalyticsByCompanySize',
    'MEMBER_COMPANY_SIZE',
    'companySize',
    'linkedin_ads_ad_analytics_by_company_size',
  ],
];

describe('member breakdown nodes', () => {
  it.each(MEMBER_NODES)(
    '%s offers its value, the campaign and the metrics',
    (node, pivot, field) => {
      const schema = fieldsSchema[node];
      const fieldNames = Object.keys(schema.fields);

      expect(schema.memberPivot).toBe(pivot);
      expect(schema.memberField).toBe(field);
      expect(schema.isTimeSeries).toBe(true);
      expect(fieldNames).toEqual(
        expect.arrayContaining([
          'account',
          'campaign',
          field,
          `${field}Name`,
          'costInLocalCurrency',
        ])
      );
      expect(schema.uniqueKeys.every(key => fieldNames.includes(key))).toBe(true);
      expect(schema.defaultFields.every(f => fieldNames.includes(f))).toBe(true);
    }
  );

  it.each(MEMBER_NODES)('%s has its table, keys and defaults', (node, pivot, field, table) => {
    const schema = fieldsSchema[node];
    expect(schema.destinationName).toBe(table);
    expect(schema.uniqueKeys).toEqual(['dateRangeStart', 'dateRangeEnd', 'campaign', field]);
    expect(schema.defaultFields).toEqual([
      'account',
      `${field}Name`,
      'impressions',
      'clicks',
      'costInLocalCurrency',
      'costInUsd',
      'landingPageClicks',
      'totalEngagements',
      'externalWebsiteConversions',
      'oneClickLeads',
    ]);
  });

  /**
   * LinkedIn answers these only for non-member pivots, and every member breakdown is a member
   * pivot; pivotValues is replaced by the account, campaign and member value columns.
   */
  it.each(MEMBER_NODES)('%s leaves out what a member pivot does not return', node => {
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

  /**
   * With two flagged fields, the column BigQuery partitions by depends on the order the
   * fields are selected in.
   */
  it.each(MEMBER_NODES)('%s partitions by dateRangeStart only', node => {
    const flagged = Object.entries(fieldsSchema[node].fields)
      .filter(([, field]) => field.GoogleBigQueryPartitioned)
      .map(([name]) => name);

    expect(flagged).toEqual(['dateRangeStart']);
    expect(globalThis.adAnalyticsFields.dateRangeEnd.GoogleBigQueryPartitioned).toBe(true);
  });

  it('writes each breakdown to its own table', () => {
    const destinations = MEMBER_NODES.map(([node]) => fieldsSchema[node].destinationName);

    expect(new Set([...destinations, fieldsSchema.adAnalytics.destinationName]).size).toBe(
      MEMBER_NODES.length + 1
    );
  });
});

describe('fetchAdAnalyticsByMember', () => {
  const CAMPAIGN_1 = 'urn:li:sponsoredCampaign:1';
  const CAMPAIGN_2 = 'urn:li:sponsoredCampaign:2';
  const US = 'urn:li:geo:103644278';
  const DE = 'urn:li:geo:101282230';

  const memberRow = (day, geoUrn, metrics) => buildRow(day, [geoUrn], metrics);

  /**
   * A LinkedIn stand-in that answers by request: the day's campaigns (a list, or a function
   * of the request URL), the member breakdown of one campaign, and member value names.
   */
  const buildLinkedIn = ({
    campaigns = [CAMPAIGN_1, CAMPAIGN_2],
    rowsByCampaign = {
      [CAMPAIGN_1]: day => [memberRow(day, US, { impressions: 10, costInLocalCurrency: '1.5' })],
      [CAMPAIGN_2]: day => [
        memberRow(day, US, { impressions: 20, costInLocalCurrency: '2.5' }),
        memberRow(day, DE, { impressions: 5, costInLocalCurrency: '0.5' }),
      ],
    },
    names = { [US]: 'United States', [DE]: 'Germany' },
    namesError = null,
  } = {}) => {
    const requests = [];
    const makeRequest = vi.fn(async url => {
      requests.push(url);
      const decoded = decodeURIComponent(url);
      const day = Number(/start:\(year:\d+,month:\d+,day:(\d+)\)/.exec(url)?.[1]);

      if (url.includes('adTargetingEntities')) {
        if (typeof namesError === 'function') {
          const error = namesError(decoded);
          if (error) throw error;
        } else if (namesError) {
          throw namesError;
        }
        return {
          elements: Object.entries(names)
            .filter(([urn]) => decoded.includes(urn))
            .map(([urn, name]) => ({ urn, name, facetUrn: 'urn:li:adTargetingFacet:locations' })),
        };
      }
      if (url.includes('pivot=CAMPAIGN&')) {
        const listed = typeof campaigns === 'function' ? campaigns(url) : campaigns;
        return { elements: listed.map(urn => ({ pivotValues: [urn], impressions: 1 })) };
      }
      const campaign = Object.keys(rowsByCampaign).find(urn => decoded.includes(`List(${urn})`));
      return { elements: campaign ? rowsByCampaign[campaign](day) : [] };
    });
    return { makeRequest, requests };
  };

  const fetchMemberDay = (self, day, nodeName = 'adAnalyticsByCountry', fields) =>
    sourceProto.fetchAdAnalyticsByMember.call(self, {
      nodeName,
      urn: URN,
      fields: fields ?? [
        'dateRangeStart',
        'dateRangeEnd',
        'account',
        'campaign',
        fieldsSchema[nodeName].memberField,
        `${fieldsSchema[nodeName].memberField}Name`,
        'impressions',
        'costInLocalCurrency',
      ],
      startDate: utcDay(day),
      endDate: utcDay(day),
    });

  it('returns a row per campaign and country, with the country name', async () => {
    const { makeRequest } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);

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

  it('reads companies per campaign and names them', async () => {
    const MICROSOFT = 'urn:li:organization:1035';
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => [memberRow(day, MICROSOFT, { impressions: 10 })] },
      names: { [MICROSOFT]: 'Microsoft' },
    });
    const { self } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1, 'adAnalyticsByCompany', [
      'dateRangeStart',
      'dateRangeEnd',
      'campaign',
      'company',
      'companyName',
      'impressions',
    ]);

    const breakdownRequests = requests.filter(url => url.includes('pivot=MEMBER_COMPANY&'));
    expect(breakdownRequests).toHaveLength(1);
    expect(breakdownRequests[0]).toContain('campaigns=List(');
    expect(requests.filter(url => url.includes('adTargetingEntities'))[0]).toContain(
      'urn%3Ali%3Aorganization%3A1035'
    );
    expect(rows).toEqual([
      expect.objectContaining({ company: MICROSOFT, companyName: 'Microsoft' }),
    ]);
  });

  /**
   * LinkedIn takes a member pivot only from the analytics finder, alone, so the campaign
   * can only come from narrowing each request to one campaign.
   */
  it('asks the analytics finder for the member pivot, one campaign per request', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1, 'adAnalyticsByRegion');

    const geoRequests = requests.filter(url => url.includes('pivot=MEMBER_REGION_V2'));
    expect(geoRequests).toHaveLength(2);
    expect(geoRequests[0]).toContain('adAnalytics?q=analytics&');
    expect(geoRequests[0]).toContain('&timeGranularity=DAILY');
    expect(geoRequests[0]).toContain(`&campaigns=List(${encodeURIComponent(CAMPAIGN_1)})`);
    expect(geoRequests[1]).toContain(`&campaigns=List(${encodeURIComponent(CAMPAIGN_2)})`);
    // The account, campaign and member value columns are filled by the connector, not asked for.
    const fields = new URL(geoRequests[0]).searchParams.get('fields').split(',');
    expect(fields).toEqual(['dateRange', 'pivotValues', 'impressions', 'costInLocalCurrency']);
  });

  /**
   * Conversions can land on a day a campaign showed no ads, so the campaigns are listed by
   * any activity, not by impressions alone.
   */
  it('lists the campaigns that ran by their activity metrics', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);

    const campaignRequests = requests.filter(url => url.includes('pivot=CAMPAIGN&'));
    expect(campaignRequests).toHaveLength(1);
    expect(campaignRequests[0]).toContain('adAnalytics?q=analytics&');
    expect(campaignRequests[0]).toContain('&timeGranularity=ALL');
    expect(campaignRequests[0]).toContain(
      `&accounts=List(${encodeURIComponent(`urn:li:sponsoredAccount:${URN}`)})`
    );
    expect(new URL(campaignRequests[0]).searchParams.get('fields')).toBe(
      'pivotValues,impressions,clicks,costInLocalCurrency'
    );
  });

  it('lists the campaigns in one request however many metrics the node imports', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const rows = await fetchMemberDay(self, 1, 'adAnalyticsByCountry', [
      'dateRangeStart',
      'dateRangeEnd',
      'campaign',
      'country',
      'impressions',
      'clicks',
    ]);

    expect(requests.filter(url => url.includes('pivot=CAMPAIGN&'))).toHaveLength(1);
    expect(new Set(rows.map(row => row.campaign))).toEqual(new Set([CAMPAIGN_1, CAMPAIGN_2]));
    expect(requests.filter(url => url.includes('pivot=MEMBER_COUNTRY_V2'))).toHaveLength(4);
  });

  /**
   * The campaign list comes from the analytics finder too, which LinkedIn documents with
   * paged answers: a real next page left unread would drop the campaigns on it.
   */
  it('reads every page of the campaign list', async () => {
    const campaigns = Array.from({ length: 12 }, (_, i) => `urn:li:sponsoredCampaign:${i + 1}`);
    const linkedIn = buildLinkedIn({ names: {} });
    const listRequests = [];
    const makeRequest = vi.fn(async url => {
      if (!url.includes('pivot=CAMPAIGN&')) return linkedIn.makeRequest(url);
      listRequests.push(url);
      const start = Number(/[?&]start=(\d+)/.exec(url)?.[1] ?? 0);
      return {
        elements: campaigns.slice(start, start + 10).map(urn => ({ pivotValues: [urn] })),
        paging: {
          start,
          count: 10,
          links: start + 10 < campaigns.length ? [{ rel: 'next', href: '/next' }] : [],
        },
      };
    });
    const { self } = buildSource({ makeRequest });

    const urns = await sourceProto.fetchActiveCampaignUrns.call(self, {
      urn: URN,
      nodeName: 'adAnalyticsByCountry',
      start: utcDay(1),
      end: utcDay(1),
    });

    expect(urns).toEqual(campaigns);
    expect(listRequests).toHaveLength(2);
  });

  it('asks nothing more on a day without campaigns', async () => {
    const { makeRequest, requests } = buildLinkedIn({ campaigns: [] });
    const { self } = buildSource({ makeRequest });

    expect(await fetchMemberDay(self, 1)).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('merges field chunks of one campaign into single rows', async () => {
    const { makeRequest } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => [memberRow(day, US, { impressions: 10, clicks: 3 })],
      },
    });
    const { self } = buildSource({ makeRequest });
    self.MAX_FIELDS_PER_REQUEST = 3;

    const rows = await fetchMemberDay(self, 1, 'adAnalyticsByCountry', [
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

  it('stores a value that is not a URN as its own name and does not look it up', async () => {
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => [
          memberRow(day, 'SIZE_201_TO_500', { impressions: 3 }),
          memberRow(day, 'SIZE_1_TO_10', { impressions: 10 }),
        ],
      },
    });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1, 'adAnalyticsByCompanySize', [
      'dateRangeStart',
      'dateRangeEnd',
      'campaign',
      'companySize',
      'companySizeName',
      'impressions',
    ]);

    expect(rows.map(row => [row.companySize, row.companySizeName])).toEqual([
      ['SIZE_201_TO_500', 'SIZE_201_TO_500'],
      ['SIZE_1_TO_10', 'SIZE_1_TO_10'],
    ]);
    expect(requests.filter(u => u.includes('adTargetingEntities'))).toHaveLength(0);
    sourceProto.onAccountComplete.call(self, { id: URN });
    expect(warnings()).toHaveLength(0);
  });

  /**
   * The storages add a column for every key of a row, so a Data Mart saved without the name
   * column has one. A row without the name would set it to NULL on the next import.
   */
  it('names the values even when the name column is not selected', async () => {
    const { makeRequest } = buildLinkedIn({ campaigns: [CAMPAIGN_1] });
    const { self } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1, 'adAnalyticsByCountry', [
      'dateRangeStart',
      'dateRangeEnd',
      'campaign',
      'country',
      'impressions',
    ]);

    expect(rows).toEqual([expect.objectContaining({ country: US, countryName: 'United States' })]);
  });

  it('leaves a value that is not a URN unnamed on a node whose values are URNs', async () => {
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => [memberRow(day, 'OTHER', { impressions: 3 })] },
    });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(rows).toEqual([expect.objectContaining({ country: 'OTHER', countryName: null })]);
    expect(requests.filter(u => u.includes('adTargetingEntities'))).toHaveLength(0);
    expect(warnings()).toEqual([
      `LinkedIn returned no name for 1 value(s) in Ad Analytics by Country for account ${URN}: ` +
        'OTHER; their name column is left empty',
    ]);
  });

  it('keeps asking for names when LinkedIn rejects a later batch after naming others', async () => {
    const rejection = Object.assign(new Error('HTTP 400: Invalid URN'), { statusCode: 400 });
    const [GEO_7, GEO_8, GEO_9] = ['urn:li:geo:7', 'urn:li:geo:8', 'urn:li:geo:9'];
    const valuesByDay = { 1: [US, DE], 2: [GEO_7, GEO_8], 3: [GEO_9] };
    const { makeRequest } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => valuesByDay[day].map(value => memberRow(day, value, {})),
      },
      names: { [US]: 'United States', [DE]: 'Germany', [GEO_9]: 'Nine' },
      namesError: decoded =>
        decoded.includes(GEO_7) || decoded.includes(GEO_8) ? rejection : null,
    });
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);
    const day2 = await fetchMemberDay(self, 2);
    const day3 = await fetchMemberDay(self, 3);

    expect(day2.map(row => row.countryName)).toEqual([null, null]);
    expect(day3.map(row => row.countryName)).toEqual(['Nine']);
    expect(self.memberNamesUnavailable).toBe(false);
    expect(warnings()).toEqual([
      `LinkedIn rejected the name lookup for ${GEO_7}, ${GEO_8} (HTTP 400: Invalid URN); ` +
        'their name column is left empty',
    ]);
  });

  it('reports the gaps of two member nodes as two warnings', async () => {
    const ORG = 'urn:li:organization:1035';
    const linkedIn = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => [
          memberRow(day, US, { impressions: 10 }),
          memberRow(day, DE, { impressions: 5 }),
        ],
      },
      names: { [US]: 'United States' },
    });
    const companies = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => [memberRow(day, ORG, { impressions: 1 })] },
      names: {},
    });
    const makeRequest = async url =>
      (url.includes('MEMBER_COMPANY') ? companies : linkedIn).makeRequest(url);
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1, 'adAnalyticsByCountry');
    await fetchMemberDay(self, 1, 'adAnalyticsByCompany');
    sourceProto.onAccountComplete.call(self, { id: URN });

    const logged = warnings();
    expect(logged).toHaveLength(2);
    const country = logged.find(m => m.includes('in Ad Analytics by Country for account'));
    const company = logged.find(m => m.includes('in Ad Analytics by Company for account'));
    expect(country).toContain(DE);
    expect(country).not.toContain(ORG);
    expect(company).toContain(ORG);
    expect(company).not.toContain(DE);

    sourceProto.onAccountComplete.call(self, { id: URN });
    expect(warnings()).toHaveLength(2);
  });

  it('looks each member value name up once per run', async () => {
    const { makeRequest, requests } = buildLinkedIn();
    const { self } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);

    const nameRequests = requests.filter(url => url.includes('adTargetingEntities'));
    expect(nameRequests).toHaveLength(1);
    expect(nameRequests[0]).toBe(
      'https://api.linkedin.com/rest/adTargetingEntities?q=urns&queryVersion=QUERY_USES_URNS' +
        `&urns=List(${encodeURIComponent(US)},${encodeURIComponent(DE)})` +
        '&locale=(language:en,country:US)'
    );
  });

  it('asks for at most NAMES_PER_REQUEST names at a time', async () => {
    const geoUrns = Array.from({ length: 5 }, (_, i) => `urn:li:geo:${i + 1}`);
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => geoUrns.map(urn => memberRow(day, urn, {})) },
      names: {},
    });
    const { self } = buildSource({ makeRequest });
    self.NAMES_PER_REQUEST = 2;

    await fetchMemberDay(self, 1);

    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(3);
  });

  it('leaves a member value LinkedIn does not name empty, and does not ask for it again', async () => {
    const { makeRequest, requests } = buildLinkedIn({ names: { [US]: 'United States' } });
    const { self } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);

    expect(rows.find(row => row.country === DE).countryName).toBeNull();
    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(1);
  });

  /**
   * A run that succeeds with empty names must still say so: otherwise nobody looks until
   * someone opens the table.
   */
  it('warns once per account about the member values LinkedIn did not name', async () => {
    const { makeRequest } = buildLinkedIn({ names: { [US]: 'United States' } });
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);
    expect(warnings()).toHaveLength(0);
    sourceProto.onAccountComplete.call(self, { id: URN });
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(warnings()).toEqual([
      `LinkedIn returned no name for 1 value(s) in Ad Analytics by Country for account ${URN}: ${DE}; ` +
        'their name column is left empty',
    ]);
  });

  it('lists a few unnamed member values and counts the rest', async () => {
    const geoUrns = Array.from({ length: 7 }, (_, i) => `urn:li:geo:${i + 1}`);
    const { makeRequest } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => geoUrns.map(urn => memberRow(day, urn, {})) },
      names: {},
    });
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(warnings()[0]).toContain(
      'no name for 7 value(s) in Ad Analytics by Country for account 123456: urn:li:geo:1, urn:li:geo:2, ' +
        'urn:li:geo:3, urn:li:geo:4, urn:li:geo:5 and 2 more'
    );
  });

  /**
   * A refusal does not change within the run: the metrics and member value URNs still load, and
   * one warning (not one more per account) says the names are missing.
   */
  it('imports the metrics without names when LinkedIn refuses the lookup, warning once', async () => {
    const refusal = Object.assign(new Error('HTTP 403: Not enough permissions'), {
      statusCode: 403,
    });
    const { makeRequest, requests } = buildLinkedIn({ namesError: refusal });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.country && row.countryName === null)).toBe(true);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('HTTP 403: Not enough permissions');
    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(1);
  });

  /**
   * Rows stored without names stay so: an incremental run only reimports its lookback window.
   * A failure LinkedIn may get over therefore fails the day, which the next run asks again.
   */
  it.each([
    ['a server error', { statusCode: 503 }],
    ['a rate limit', { statusCode: 429 }],
    ['a network error', {}],
  ])('fails the day on %s in the name lookup, and asks again next time', async (_, props) => {
    const outage = Object.assign(new Error('lookup failed'), props);
    const linkedIn = buildLinkedIn({ namesError: outage });
    const { self, warnings } = buildSource({ makeRequest: linkedIn.makeRequest });

    await expect(fetchMemberDay(self, 1)).rejects.toBe(outage);
    expect(warnings()).toHaveLength(0);

    self.makeRequest = buildLinkedIn().makeRequest;
    const rows = await fetchMemberDay(self, 1);
    expect(rows.every(row => row.countryName)).toBe(true);
  });

  /**
   * The member value and the day are part of the unique key, and a key with an empty part never
   * matches on reimport: such a row would be stored again on every run.
   */
  it('leaves out rows without a member value or a date and says how many', async () => {
    const { makeRequest } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: {
        [CAMPAIGN_1]: day => [
          memberRow(day, US, { impressions: 10 }),
          buildRow(day, [], { impressions: 4 }),
          { dateRange: buildRow(day, []).dateRange, impressions: 1 },
          { pivotValues: [DE], impressions: 2 },
        ],
      },
    });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(rows.map(row => row.country)).toEqual([US]);
    expect(warnings()).toEqual([
      `LinkedIn returned 3 row(s) without a value or a date in Ad Analytics by Country for account ${URN}; ` +
        'they were not imported',
    ]);
  });

  it('names each day cut short by the element limit once, however many campaigns hit it', async () => {
    const fullDay = day =>
      Array.from({ length: 15000 }, (_, i) => memberRow(day, `urn:li:geo:${i}`, {}));
    const { makeRequest } = buildLinkedIn({
      rowsByCampaign: { [CAMPAIGN_1]: fullDay, [CAMPAIGN_2]: fullDay },
    });
    const { self, warnings } = buildSource({ makeRequest });
    self.NAMES_PER_REQUEST = 15000;

    await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    const truncation = warnings().filter(message => message.includes('element limit'));
    expect(truncation).toHaveLength(1);
    expect(truncation[0]).toContain(`Ad Analytics by Country responses for account ${URN}`);
    expect(truncation[0]).toContain('on 1 day(s): 2026-08-01;');
  });

  /**
   * A 400 can come from a single URN LinkedIn will not take: the batch is split until that
   * URN is found, so it alone stays unnamed and the rest keep their names.
   */
  it('splits a rejected name batch down to the URN LinkedIn will not take', async () => {
    const geoUrns = Array.from({ length: 4 }, (_, i) => `urn:li:geo:${i + 1}`);
    const rejection = Object.assign(new Error('HTTP 400: Invalid URN'), { statusCode: 400 });
    const { makeRequest, requests } = buildLinkedIn({
      campaigns: [CAMPAIGN_1],
      rowsByCampaign: { [CAMPAIGN_1]: day => geoUrns.map(urn => memberRow(day, urn, {})) },
      names: Object.fromEntries(geoUrns.map(urn => [urn, `Name of ${urn}`])),
      namesError: decoded => (/urn:li:geo:2[,)]/.test(decoded) ? rejection : null),
    });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);
    sourceProto.onAccountComplete.call(self, { id: URN });

    const nameRequests = requests.filter(url => url.includes('adTargetingEntities'));
    // [1,2,3,4] → [1,2] → [1], [2] → [3,4]; nothing is asked again on day 2.
    expect(nameRequests.map(url => decodeURIComponent(url).match(/List\(([^)]*)\)/)[1])).toEqual([
      'urn:li:geo:1,urn:li:geo:2,urn:li:geo:3,urn:li:geo:4',
      'urn:li:geo:1,urn:li:geo:2',
      'urn:li:geo:1',
      'urn:li:geo:2',
      'urn:li:geo:3,urn:li:geo:4',
    ]);
    expect(rows.map(row => row.countryName)).toEqual([
      'Name of urn:li:geo:1',
      null,
      'Name of urn:li:geo:3',
      'Name of urn:li:geo:4',
    ]);
    expect(warnings()).toEqual([
      'LinkedIn rejected the name lookup for urn:li:geo:2 (HTTP 400: Invalid URN); ' +
        'their name column is left empty',
      `LinkedIn returned no name for 1 value(s) in Ad Analytics by Country for account ${URN}: urn:li:geo:2; ` +
        'their name column is left empty',
    ]);
  });

  it('stops asking for names when LinkedIn takes no URN of a batch, even one at a time', async () => {
    const rejection = Object.assign(new Error('HTTP 400: Invalid URN'), { statusCode: 400 });
    const { makeRequest, requests } = buildLinkedIn({ namesError: rejection });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    await fetchMemberDay(self, 2);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(rows.every(row => row.countryName === null)).toBe(true);
    // [US, DE] → [US], [DE]; then no more lookups this run.
    expect(requests.filter(url => url.includes('adTargetingEntities'))).toHaveLength(3);
    expect(warnings()).toEqual([
      'LinkedIn rejected the name lookup for every value asked, one at a time too ' +
        '(HTTP 400: Invalid URN); names are left empty, and the URNs and metrics are imported',
    ]);
  });

  it('reads the next page of names when LinkedIn pages the answer', async () => {
    const pages = [
      {
        elements: [{ urn: US, name: 'United States' }],
        paging: { start: 0, count: 1, links: [{ rel: 'next', href: '/rest/next' }] },
      },
      { elements: [{ urn: DE, name: 'Germany' }], paging: { start: 1, count: 1, links: [] } },
    ];
    const linkedIn = buildLinkedIn();
    const nameRequests = [];
    const makeRequest = vi.fn(async url => {
      if (!url.includes('adTargetingEntities')) return linkedIn.makeRequest(url);
      nameRequests.push(url);
      return pages[nameRequests.length - 1];
    });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(nameRequests).toHaveLength(2);
    expect(nameRequests[1]).toBe(`${nameRequests[0]}&start=1`);
    expect(rows.map(row => row.countryName)).toEqual(['United States', 'United States', 'Germany']);
    expect(warnings()).toHaveLength(0);
  });

  it('takes an empty name for no name, and lists it', async () => {
    const { makeRequest } = buildLinkedIn({ names: { [US]: 'United States', [DE]: '' } });
    const { self, warnings } = buildSource({ makeRequest });

    const rows = await fetchMemberDay(self, 1);
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(rows.find(row => row.country === DE).countryName).toBeNull();
    expect(warnings()[0]).toContain(
      `no name for 1 value(s) in Ad Analytics by Country for account ${URN}: ${DE};`
    );
  });

  /**
   * The engine skips onAccountComplete for an account with an issue, so the days it imported
   * before failing would otherwise never be reported.
   */
  it('reports what an account gathered before it failed', async () => {
    const { makeRequest } = buildLinkedIn({ names: { [US]: 'United States' } });
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1);
    sourceProto.onAccountError.call(self, { id: URN }, new Error('HTTP 429'));
    sourceProto.onAccountError.call(self, { id: URN }, new Error('HTTP 429'));

    expect(warnings()).toEqual([
      `LinkedIn returned no name for 1 value(s) in Ad Analytics by Country for account ${URN}: ${DE}; ` +
        'their name column is left empty',
    ]);
  });

  /**
   * After a failure the engine never calls onAccountComplete for the account, so each later
   * day is reported right after it rather than not at all.
   */
  it('reports each later day of an account that already failed', async () => {
    const { makeRequest } = buildLinkedIn({ names: { [US]: 'United States' } });
    const { self, warnings } = buildSource({ makeRequest });
    const fetchCountryDay = day =>
      sourceProto.fetchData.call(self, {
        nodeName: 'adAnalyticsByCountry',
        fields: [...fieldsSchema.adAnalyticsByCountry.uniqueKeys, 'countryName'],
        accountId: URN,
        startDate: utcDay(day),
        endDate: utcDay(day),
      });

    await fetchCountryDay(1);
    expect(warnings()).toHaveLength(0);

    sourceProto.onAccountError.call(self, { id: URN }, new Error('HTTP 429'));
    expect(warnings()).toHaveLength(1);

    self.memberNames.clear();
    await fetchCountryDay(2);
    expect(warnings()).toHaveLength(2);
    expect(warnings()[1]).toContain(
      `no name for 1 value(s) in Ad Analytics by Country for account ${URN}: ${DE};`
    );
  });

  it('records a cut-short campaign list as a truncated day of the node', async () => {
    const campaigns = Array.from({ length: 15000 }, (_, i) => `urn:li:sponsoredCampaign:${i}`);
    const { makeRequest } = buildLinkedIn({ campaigns, rowsByCampaign: {} });
    const { self, warnings } = buildSource({ makeRequest });

    await fetchMemberDay(self, 1, 'adAnalyticsByRegion');
    sourceProto.onAccountComplete.call(self, { id: URN });

    expect(warnings()).toEqual([
      `Ad Analytics by Region responses for account ${URN} reached LinkedIn's 15000-element ` +
        'limit on 1 day(s): 2026-08-01; data for those days may be incomplete',
    ]);
  });

  describe('pages of a member-pivot answer', () => {
    const regions = Array.from({ length: 25 }, (_, i) => `urn:li:geo:${i + 1}`);
    const next = { rel: 'next', href: '/adAnalytics?start=10&count=10', type: 'application/json' };

    /** LinkedIn answering the breakdown with `answer(start)`; everything else as usual. */
    const pagedLinkedIn = answer => {
      const linkedIn = buildLinkedIn({ campaigns: [CAMPAIGN_1], names: {} });
      const geoRequests = [];
      const makeRequest = vi.fn(async url => {
        if (!url.includes('pivot=MEMBER_')) return linkedIn.makeRequest(url);
        geoRequests.push(url);
        return answer(Number(/[?&]start=(\d+)/.exec(url)?.[1] ?? 0));
      });
      return { makeRequest, geoRequests };
    };
    const page = (start, count = 10) => ({
      elements: regions
        .slice(start, start + count)
        .map(urn => memberRow(1, urn, { impressions: 1 })),
      paging: { start, count, links: start + count < regions.length ? [next] : [] },
    });

    /**
     * LinkedIn's docs say adAnalytics does not paginate, yet show member-pivot answers with
     * a next link. Were they real, reading the first page alone would drop most member values.
     */
    it('reads every page when LinkedIn really pages the answer', async () => {
      const { makeRequest, geoRequests } = pagedLinkedIn(start => page(start));
      const { self } = buildSource({ makeRequest });

      const rows = await fetchMemberDay(self, 1, 'adAnalyticsByRegion');

      expect(rows).toHaveLength(25);
      expect(geoRequests).toHaveLength(3);
      expect(geoRequests[1]).toBe(`${geoRequests[0]}&start=10&count=10`);
      expect(geoRequests[2]).toBe(`${geoRequests[0]}&start=20&count=10`);
    });

    it('takes a page shorter than paging.count for the whole answer, as in the docs', async () => {
      const { makeRequest, geoRequests } = pagedLinkedIn(() => ({
        elements: regions.slice(0, 3).map(urn => memberRow(1, urn, { impressions: 1 })),
        paging: { start: 0, count: 10, links: [next] },
      }));
      const { self } = buildSource({ makeRequest });

      const rows = await fetchMemberDay(self, 1, 'adAnalyticsByRegion');

      expect(rows).toHaveLength(3);
      expect(geoRequests).toHaveLength(1);
    });

    it('stops when LinkedIn ignores start and repeats the page', async () => {
      const { makeRequest, geoRequests } = pagedLinkedIn(() => page(0));
      const { self } = buildSource({ makeRequest });

      const rows = await fetchMemberDay(self, 1, 'adAnalyticsByRegion');

      expect(rows).toHaveLength(10);
      expect(geoRequests).toHaveLength(2);
    });

    it('never pages a request without a member pivot', async () => {
      const requests = [];
      const { self } = buildSource({
        makeRequest: vi.fn(async url => {
          requests.push(url);
          return {
            elements: Array.from({ length: 10 }, (_, i) => buildRow(1, [String(i)])),
            paging: { start: 0, count: 10, links: [next] },
          };
        }),
      });

      await fetchDay(self, 1);

      expect(requests).toHaveLength(1);
    });
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
