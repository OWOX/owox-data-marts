/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * adAnalytics metrics LinkedIn does not return for a member (MEMBER_*) pivot, which every
 * geo breakdown is. pivotValues is replaced by the account, campaign and location columns.
 */
var AD_ANALYTICS_FIELDS_NOT_IN_GEO_BREAKDOWN = [
  'pivotValues',
  'approximateMemberReach',
  'audiencePenetration',
  'cardClicks',
  'cardImpressions',
  'viralCardClicks',
  'viralCardImpressions',
  'conversionValueInLocalCurrency',
];

/**
 * Fields of one adAnalytics geo breakdown node: a row per campaign, day and location.
 *
 * Built from adAnalyticsFields when the schema is evaluated, so a metric added there is
 * offered here as well unless LinkedIn excludes it from member pivots.
 *
 * @param {string} geoField - the location level and its column name: country, region or county
 * @returns {Object} field name -> { description, type }
 */
function buildAdAnalyticsByGeoFields(geoField) {
  const metrics = Object.fromEntries(
    Object.entries(adAnalyticsFields).filter(
      ([name]) => !AD_ANALYTICS_FIELDS_NOT_IN_GEO_BREAKDOWN.includes(name)
    )
  );
  // One partition column per table: dateRangeStart. adAnalyticsFields flags both dates, and
  // with two flags the column BigQuery partitions by depends on the order fields are selected.
  const dateRangeEnd = { ...adAnalyticsFields.dateRangeEnd };
  delete dateRangeEnd.GoogleBigQueryPartitioned;

  return {
    account: {
      description: 'URN of the advertising account, for example urn:li:sponsoredAccount:{id}.',
      type: DATA_TYPES.STRING,
    },
    campaign: {
      description:
        'URN of the campaign, for example urn:li:sponsoredCampaign:{id}. Its {id} is the id ' +
        'in Campaigns.',
      type: DATA_TYPES.STRING,
    },
    [geoField]: {
      description: `URN of the member ${geoField} the metrics belong to, for example urn:li:geo:{id}.`,
      type: DATA_TYPES.STRING,
    },
    [`${geoField}Name`]: {
      description:
        `Name of the member ${geoField} in English, as LinkedIn spells it, for example ` +
        `"United States" or "California, United States". Empty when LinkedIn returns no ` +
        `name for the location.`,
      type: DATA_TYPES.STRING,
    },
    ...metrics,
    dateRangeEnd,
  };
}
