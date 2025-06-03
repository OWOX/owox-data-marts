/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var RedditFieldsSchema = {
  "ad-account-user": {
    "overview": "Ad Account User",
    "description": "Get the authenticated member",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Me",
    "fields": adAccountUserFields,
    "uniqueKeys": ["id"]
  },
  "ad-account": {
    "overview": "Ad Account",
    "description": "Retrieve an ad account and its details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Ad%20Account",
    "fields": adAccountFields,
    "uniqueKeys": ["id"]
  },
  "ad-group": {
    "overview": "Ad Group",
    "description": "Retrieve ad groups and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Groups",
    "fields": adGroupFields,
    "uniqueKeys": ["id"]
  },
  "ads": {
    "overview": "Ad",
    "description": "Retrieve ads and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ads",
    "fields": adsFields,
    "uniqueKeys": ["id"]
  },
  "campaigns": {
    "overview": "Campaign",
    "description": "Retrieve campaigns and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Campaigns",
    "fields": campaignsFields,
    "uniqueKeys": ["id"]
  },
  "user-custom-audience": {
    "overview": "User Custom Audience",
    "description": "Retrieve user custom audiences and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20User%20Custom%20Audiences",
    "fields": userCustomAudienceFields,
    "uniqueKeys": ["id"]
  },
  "funding-instruments": {
    "overview": "Funding Instrument",
    "description": "Retrieve funding instruments and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Funding%20Instruments",
    "fields": fundingInstrumentFields,
    "uniqueKeys": ["id"]
  },
  "lead-gen-form": {
    "overview": "Lead Gen Form",
    "description": "Retrieve lead generation forms and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Lead%20Gen%20Forms",
    "fields": leadGenFormFields,
    "uniqueKeys": ["id"]
  },
  "report": {
    "overview": "User Ad Metrics by ad_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by ad_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date"],
    "isTimeSeries": true
  },
  "report-by-COUNTRY": {
    "overview": "User Ad Metrics by country",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by country.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "country"],
    "isTimeSeries": true
  },
  "report-by-AD_GROUP_ID": {
    "overview": "User Ad Metrics by ad_group_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by ad_group_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "ad_group_id"],
    "isTimeSeries": true
  },
  "report-by-CAMPAIGN_ID": {
    "overview": "User Ad Metrics by campaign_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by campaign_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "campaign_id"],
    "isTimeSeries": true
  },
  "report-by-DMA": {
    "overview": "User Ad Metrics by dma",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by dma.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "dma"],
    "isTimeSeries": true
  },
  "report-by-INTEREST": {
    "overview": "User Ad Metrics by interest",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by interest.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "interest"],
    "isTimeSeries": true
  },
  "report-by-KEYWORD": {
    "overview": "User Ad Metrics by keyword",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by keyword.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "keyword"],
    "isTimeSeries": true
  },
  "report-by-PLACEMENT": {
    "overview": "User Ad Metrics by placement",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by placement.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "placement"],
    "isTimeSeries": true
  },
  "report-by-AD_ACCOUNT_ID": {
    "overview": "User Ad Metrics by account_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by account_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "account_id"],
    "isTimeSeries": true
  },
  "report-by-COMMUNITY": {
    "overview": "User Ad Metrics by community",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by community.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "community"],
    "isTimeSeries": true
  }
}
