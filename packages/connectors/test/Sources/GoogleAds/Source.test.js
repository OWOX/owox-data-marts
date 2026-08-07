import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadGasClass } from '../../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiReferenceDir = path.join(
  __dirname,
  '../../../src/Sources/GoogleAds/GoogleAdsAPIReference'
);

loadGasClass(path.join(__dirname, '../../../src/Constants/HttpConstants.js'));
loadGasClass(path.join(__dirname, '../../../src/Core/AbstractSource.js'));
loadGasClass(path.join(__dirname, '../../../src/Sources/GoogleAds/Source.js'));
const proto = globalThis.GoogleAdsSource.prototype;

// Each field file declares its object with `var`, so it attaches to globalThis once
// loaded (GAS-style scripts, no imports/exports). GoogleAdsFieldsSchema.js itself uses
// `const`, which vm.runInThisContext does NOT attach to globalThis, so it's rebuilt here
// from the field globals instead of being loaded directly — this mirrors the node -> fields
// mapping in src/Sources/GoogleAds/GoogleAdsAPIReference/GoogleAdsFieldsSchema.js.
loadGasClass(path.join(__dirname, '../../../src/Constants/DataTypes.js'));
for (const file of [
  'campaignsFields.js',
  'campaignsStatsFields.js',
  'adGroupsFields.js',
  'adGroupsStatsFields.js',
  'adGroupAdsStatsFields.js',
  'keywordsStatsFields.js',
  'criterionFields.js',
  'geoTargetFields.js',
  'geoTargetConstantFields.js',
]) {
  loadGasClass(path.join(apiReferenceDir, file));
}
const fieldsSchemaSelf = {
  fieldsSchema: {
    campaigns: { fields: globalThis.campaignFields },
    campaigns_stats: { fields: globalThis.campaignStatsFields },
    ad_groups: { fields: globalThis.adGroupFields },
    ad_groups_stats: { fields: globalThis.adGroupStatsFields },
    ad_group_ads_stats: { fields: globalThis.adGroupAdStatsFields },
    keywords_stats: { fields: globalThis.keywordStatsFields },
    criterion: { fields: globalThis.criterionFields },
    geo_stats: { fields: globalThis.geoTargetFields },
    geo_target_constants: { fields: globalThis.geoTargetConstantFields },
  },
};

const callGetAccessToken = tokenError => {
  globalThis.OAuthUtils = {
    getAccessToken: async () => {
      throw tokenError;
    },
  };
  const self = {
    config: {
      AuthType: { value: 'oauth2', items: { ClientId: {}, ClientSecret: {}, RefreshToken: {} } },
      logMessage: () => {},
    },
  };
  return proto.getAccessToken.call(self).catch(e => e);
};

// getAccessToken rewraps every auth failure into a new Error. Without an explicit
// hand-off the isWarning flag is dropped and a dead refresh token pages as an error.
describe('getAccessToken error wrapping', () => {
  it('preserves the warning flag through the rewrap', async () => {
    const error = await callGetAccessToken(
      Object.assign(new Error('Token error: invalid_grant'), { isWarning: true })
    );
    expect(error.message).toContain('Authentication failed');
    expect(error.isWarning).toBe(true);
  });

  it('leaves unflagged failures as errors', async () => {
    const error = await callGetAccessToken(new Error('Token error: invalid_client'));
    expect(error.isWarning).toBeFalsy();
  });
});

// v25 rejects the whole GAQL query if a single selected field is unrecognized (see
// run 1aed25d5: 'metrics.video_views' alone failed a 25-field campaigns_stats query).
// These names were renamed between v21 and v25 and must stay mapped correctly.
describe('_getAPIFields against the v25 field catalog', () => {
  it('maps video metrics to their v25 TrueView names on campaigns_stats', () => {
    const apiFields = proto._getAPIFields.call(
      fieldsSchemaSelf,
      ['video_views', 'video_view_rate'],
      'campaigns_stats'
    );
    expect(apiFields).toEqual(['metrics.video_trueview_views', 'metrics.video_trueview_view_rate']);
  });

  it('maps campaign start/end date to v25 *_date_time fields on campaigns', () => {
    const apiFields = proto._getAPIFields.call(
      fieldsSchemaSelf,
      ['campaign_start_date', 'campaign_end_date'],
      'campaigns'
    );
    expect(apiFields).toEqual(['campaign.start_date_time', 'campaign.end_date_time']);
  });

  it('no longer references the pre-v25 field names removed from the API', () => {
    const allApiNames = Object.values(fieldsSchemaSelf.fieldsSchema).flatMap(node =>
      Object.values(node.fields).map(field => field.apiName)
    );
    expect(allApiNames).not.toContain('metrics.video_views');
    expect(allApiNames).not.toContain('metrics.video_view_rate');
    expect(allApiNames).not.toContain('campaign.start_date');
    expect(allApiNames).not.toContain('campaign.end_date');
  });
});
