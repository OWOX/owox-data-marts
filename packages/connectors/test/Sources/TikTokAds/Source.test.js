import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreSourcePath = path.join(__dirname, '../../../src/Core/AbstractSource.js');
const sourcePath = path.join(__dirname, '../../../src/Sources/TikTokAds/Source.js');

// Both files are GAS-style code (`var X = class X {...}`, no imports/exports).
// Load the real AbstractSource first so TikTokAdsSource's `extends AbstractSource`
// and `super.getFieldsSchema()` resolve against the actual implementation, not a
// hand-copied stub that could drift from it. We never instantiate either class, so
// constructor-only globals (CONFIG_ATTRIBUTES, etc.) never need to be real. Loaded at
// module scope (not in beforeAll) so describe-body code below can use `proto` too —
// describe callbacks run during collection, before any beforeAll hook fires.
loadGasClass(coreSourcePath);
loadGasClass(sourcePath);
const proto = globalThis.TikTokAdsSource.prototype;

describe('getDimensionsForDataLevel', () => {
  it.each([
    ['AUCTION_ADVERTISER', ['stat_time_day']],
    ['AUCTION_CAMPAIGN', ['campaign_id', 'stat_time_day']],
    ['AUCTION_ADGROUP', ['adgroup_id', 'stat_time_day']],
    ['AUCTION_AD', ['ad_id', 'stat_time_day']],
  ])('%s -> %j', (dataLevel, expected) => {
    expect(proto.getDimensionsForDataLevel.call(null, dataLevel)).toEqual(expected);
  });

  it('falls back to AUCTION_AD dimensions for an unknown level', () => {
    expect(proto.getDimensionsForDataLevel.call(null, 'NOT_A_LEVEL')).toEqual([
      'ad_id',
      'stat_time_day',
    ]);
  });
});

describe('getUniqueKeysForNode', () => {
  const fakeSource = {
    getDimensionsForDataLevel: proto.getDimensionsForDataLevel,
    populateDimensions: proto.populateDimensions,
    fieldsSchema: { ads: { uniqueKeys: ['ad_id'] } },
  };
  const uniqueKeysFor = (nodeName, dataLevel) =>
    proto.getUniqueKeysForNode.call(fakeSource, nodeName, dataLevel);

  // advertiser_id is always included: AdvertiserIDs can list several advertisers writing
  // into the same destination table, and AUCTION_ADVERTISER has no other dimension to
  // separate them, so the BigQuery MERGE key would collide across advertisers without it.
  it('ad_insights drops ad_id but keeps advertiser_id at AUCTION_ADVERTISER', () => {
    expect(uniqueKeysFor('ad_insights', 'AUCTION_ADVERTISER')).toEqual([
      'stat_time_day',
      'advertiser_id',
    ]);
  });

  it('ad_insights keeps ad_id and advertiser_id at AUCTION_AD', () => {
    expect(uniqueKeysFor('ad_insights', 'AUCTION_AD')).toEqual([
      'ad_id',
      'stat_time_day',
      'advertiser_id',
    ]);
  });

  it('ad_insights_by_country adds country_code and advertiser_id on top of the data-level dimensions', () => {
    expect(uniqueKeysFor('ad_insights_by_country', 'AUCTION_ADVERTISER')).toEqual([
      'stat_time_day',
      'country_code',
      'advertiser_id',
    ]);
    expect(uniqueKeysFor('ad_insights_by_country', 'AUCTION_CAMPAIGN')).toEqual([
      'campaign_id',
      'stat_time_day',
      'country_code',
      'advertiser_id',
    ]);
  });

  it('falls back to the static schema uniqueKeys for non-insights nodes', () => {
    expect(uniqueKeysFor('ads', null)).toEqual(['ad_id']);
  });
});

describe('getFieldsSchema', () => {
  const fakeSource = {
    getDimensionsForDataLevel: proto.getDimensionsForDataLevel,
    populateDimensions: proto.populateDimensions,
    getUniqueKeysForNode: proto.getUniqueKeysForNode,
    fieldsSchema: {
      ads: { uniqueKeys: ['ad_id'], fields: { ad_id: {} } },
      ad_insights: {
        uniqueKeys: ['ad_id', 'stat_time_day', 'advertiser_id'],
        fields: { ad_id: {}, stat_time_day: {}, advertiser_id: {} },
      },
      ad_insights_by_country: {
        uniqueKeys: ['ad_id', 'stat_time_day', 'country_code', 'advertiser_id'],
        fields: { ad_id: {}, stat_time_day: {}, country_code: {}, advertiser_id: {} },
      },
      catalog_only: {}, // no `fields` -> excluded by the base getFieldsSchema filter
    },
  };
  const schema = () => proto.getFieldsSchema.call(fakeSource);

  it('excludes nodes without a fields map, like the base implementation', () => {
    expect(schema().catalog_only).toBeUndefined();
  });

  it('leaves non-insights nodes untouched', () => {
    expect(schema().ads).toEqual({ uniqueKeys: ['ad_id'], fields: { ad_id: {} } });
  });

  it('attaches uniqueKeysByDataLevel for every data level on ad_insights, always including advertiser_id', () => {
    expect(schema().ad_insights.uniqueKeysByDataLevel).toEqual({
      AUCTION_ADVERTISER: ['stat_time_day', 'advertiser_id'],
      AUCTION_CAMPAIGN: ['campaign_id', 'stat_time_day', 'advertiser_id'],
      AUCTION_ADGROUP: ['adgroup_id', 'stat_time_day', 'advertiser_id'],
      AUCTION_AD: ['ad_id', 'stat_time_day', 'advertiser_id'],
    });
  });

  it('attaches country_code- and advertiser_id-inclusive uniqueKeysByDataLevel for ad_insights_by_country', () => {
    expect(schema().ad_insights_by_country.uniqueKeysByDataLevel).toEqual({
      AUCTION_ADVERTISER: ['stat_time_day', 'country_code', 'advertiser_id'],
      AUCTION_CAMPAIGN: ['campaign_id', 'stat_time_day', 'country_code', 'advertiser_id'],
      AUCTION_ADGROUP: ['adgroup_id', 'stat_time_day', 'country_code', 'advertiser_id'],
      AUCTION_AD: ['ad_id', 'stat_time_day', 'country_code', 'advertiser_id'],
    });
  });

  it('does not mutate the source fieldsSchema it read from', () => {
    schema();
    expect(fakeSource.fieldsSchema.ad_insights.uniqueKeysByDataLevel).toBeUndefined();
  });
});

describe('fetchData unique-key validation', () => {
  const createSource = () => ({
    fieldsSchema: {
      ad_insights: {
        uniqueKeys: ['ad_id', 'stat_time_day', 'advertiser_id'],
        fields: {
          ad_id: {},
          stat_time_day: {},
          advertiser_id: {},
        },
      },
      // Non-insights node so getUniqueKeysForNode's static fallback path stays exercisable
      // if a future test targets a catalog node.
      ads: { uniqueKeys: ['ad_id'], fields: { ad_id: {} } },
    },
    config: {},
    getValidatedDataLevel: () => 'AUCTION_AD',
    getUniqueKeysForNode: proto.getUniqueKeysForNode,
    getDimensionsForDataLevel: proto.getDimensionsForDataLevel,
    populateDimensions: proto.populateDimensions,
    getFilteredMetrics: proto.getFilteredMetrics,
    castFields: record => record,
    _getAppId: () => '',
    _getAccessToken: () => '',
    _getAppSecret: () => '',
  });

  it('allows advertiser_id to be omitted because castFields injects it', async () => {
    const originalProvider = globalThis.TiktokMarketingApiProvider;
    globalThis.TiktokMarketingApiProvider = class {
      getValidAdInsightsMetrics() {
        return [];
      }

      async getAdInsights() {
        return [];
      }
    };

    try {
      await expect(
        proto.fetchData.call(createSource(), 'ad_insights', 'advertiser-1', [
          'ad_id',
          'stat_time_day',
        ])
      ).resolves.toHaveLength(0);
    } finally {
      globalThis.TiktokMarketingApiProvider = originalProvider;
    }
  });

  it('still rejects unique keys that must be returned by the API', async () => {
    await expect(
      proto.fetchData.call(createSource(), 'ad_insights', 'advertiser-1', [
        'stat_time_day',
        'advertiser_id',
      ])
    ).rejects.toThrow(
      "Missing required unique fields for endpoint 'ad_insights'. Missing fields: ad_id"
    );
  });
});
