/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * adAnalytics metrics LinkedIn does not return for a member (MEMBER_*) pivot, which every
 * member breakdown is. pivotValues is replaced by the account, campaign and member value columns.
 */
var AD_ANALYTICS_FIELDS_NOT_IN_MEMBER_BREAKDOWN = [
  'pivotValues',
  'approximateMemberReach',
  'audiencePenetration',
  'cardClicks',
  'cardImpressions',
  'viralCardClicks',
  'viralCardImpressions',
  'conversionValueInLocalCurrency',
];

function geoBreakdownColumns(level) {
  return {
    value: `URN of the member ${level} the metrics belong to, for example urn:li:geo:{id}.`,
    name:
      `Name of the member ${level} in English, as LinkedIn spells it, for example ` +
      '"United States" or "California, United States". Empty when LinkedIn returns no ' +
      'name for the location.',
  };
}

var MEMBER_BREAKDOWN_COLUMNS = {
  country: geoBreakdownColumns('country'),
  region: geoBreakdownColumns('region'),
  county: geoBreakdownColumns('county'),
  company: {
    value:
      'URN of the company the members work for, for example urn:li:organization:{id}. The campaign may not have targeted this company.',
    name:
      'Name of the company in English, as LinkedIn spells it, for example "Microsoft". Empty when LinkedIn returns no name.',
  },
  jobTitle: {
    value: 'URN of the member job title the metrics belong to, for example urn:li:title:{id}.',
    name:
      'Name of the job title in English, as LinkedIn spells it. Empty when LinkedIn returns no name.',
  },
  seniority: {
    value:
      'URN of the member seniority level the metrics belong to, for example urn:li:seniority:{id}.',
    name:
      'Name of the seniority level in English, as LinkedIn spells it. Empty when LinkedIn returns no name.',
  },
  jobFunction: {
    value:
      'URN of the member job function the metrics belong to, for example urn:li:function:{id}.',
    name:
      'Name of the job function in English, as LinkedIn spells it. Empty when LinkedIn returns no name.',
  },
  industry: {
    value: 'URN of the member industry the metrics belong to, for example urn:li:industry:{id}.',
    name:
      'Name of the industry in English, as LinkedIn spells it. Empty when LinkedIn returns no name.',
  },
  companySize: {
    value: 'Size band of the member company as LinkedIn returns it, for example SIZE_201_TO_500.',
    name:
      'Name of the company size band. LinkedIn returns no separate name, so this repeats the band.',
  },
};

/**
 * Fields of one adAnalytics member breakdown node: a row per campaign, day and member value.
 *
 * Built from adAnalyticsFields when the schema is evaluated, so a metric added there is
 * offered here as well unless LinkedIn excludes it from member pivots.
 *
 * @param {string} memberField - the value column name, a key of MEMBER_BREAKDOWN_COLUMNS
 * @returns {Object} field name -> { description, type }
 */
function buildAdAnalyticsByMemberFields(memberField) {
  const metrics = Object.fromEntries(
    Object.entries(adAnalyticsFields).filter(
      ([name]) => !AD_ANALYTICS_FIELDS_NOT_IN_MEMBER_BREAKDOWN.includes(name)
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
    [memberField]: {
      description: MEMBER_BREAKDOWN_COLUMNS[memberField].value,
      type: DATA_TYPES.STRING,
    },
    [`${memberField}Name`]: {
      description: MEMBER_BREAKDOWN_COLUMNS[memberField].name,
      type: DATA_TYPES.STRING,
    },
    ...metrics,
    dateRangeEnd,
  };
}
