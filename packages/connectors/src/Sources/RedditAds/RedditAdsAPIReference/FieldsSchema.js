/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 * 
 * Commented endpoints will be implemented later.
 */

var RedditFieldsSchema = {
  // "ad-account-user": {
  //   "overview": "Ad Account User",
  //   "description": "Get the authenticated member",
  //   "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Me",
  //   "fields": adAccountUserFields,
  //   "uniqueKeys": ["id"],
  //   "destinationName": "reddit_ads_ad_account_user"
  // },
  // "ad-account": {
  //   "overview": "Ad Account",
  //   "description": "Retrieve an ad account and its details.",
  //   "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Ad%20Account",
  //   "fields": adAccountFields,
  //   "uniqueKeys": ["id"],
  //   "destinationName": "reddit_ads_ad_account"
  // },
  "ad-group": {
    "overview": "Ad Group",
    "description": "Retrieve ad groups and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Groups",
    "fields": adGroupFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_ad_group",
    "parameters": {
      "pageSize": {
        "description": "Number of results to return per page",
        "type": "integer",
        "default": 10
      }
    }
  },
  "ads": {
    "overview": "Ad",
    "description": "Retrieve ads and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ads",
    "fields": adsFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_ads"
  },
  "campaigns": {
    "overview": "Campaign",
    "description": "Retrieve campaigns and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Campaigns",
    "fields": campaignsFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_campaigns"
  },
  "user-custom-audience": {
    "overview": "User Custom Audience",
    "description": "Retrieve user custom audiences and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20User%20Custom%20Audiences",
    "fields": userCustomAudienceFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_user_custom_audience"
  },
  "funding-instruments": {
    "overview": "Funding Instrument",
    "description": "Retrieve funding instruments and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Funding%20Instruments",
    "fields": fundingInstrumentFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_funding_instruments"
  },
  "lead-gen-form": {
    "overview": "Lead Gen Form",
    "description": "Retrieve lead generation forms and their details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Lead%20Gen%20Forms",
    "fields": leadGenFormFields,
    "uniqueKeys": ["id"],
    "destinationName": "reddit_ads_lead_gen_form"
  },
  "report": {
    "overview": "User Ad Metrics by ad_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by ad_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date"],
    "destinationName": "reddit_ads_report",
    "isTimeSeries": true
  },
  "report-by-COUNTRY": {
    "overview": "User Ad Metrics by country",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by country.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "country"],
    "destinationName": "reddit_ads_report_by_COUNTRY",
    "isTimeSeries": true
  },
  "report-by-AD_GROUP_ID": {
    "overview": "User Ad Metrics by ad_group_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by ad_group_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "ad_group_id"],
    "destinationName": "reddit_ads_report_by_AD_GROUP_ID",
    "isTimeSeries": true
  },
  "report-by-CAMPAIGN_ID": {
    "overview": "User Ad Metrics by campaign_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by campaign_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "campaign_id"],
    "destinationName": "reddit_ads_report_by_CAMPAIGN_ID",
    "isTimeSeries": true
  },
  "report-by-DMA": {
    "overview": "User Ad Metrics by dma",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by dma.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "dma"],
    "destinationName": "reddit_ads_report_by_DMA",
    "isTimeSeries": true
  },
  "report-by-INTEREST": {
    "overview": "User Ad Metrics by interest",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by interest.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "interest"],
    "destinationName": "reddit_ads_report_by_INTEREST",
    "isTimeSeries": true
  },
  "report-by-KEYWORD": {
    "overview": "User Ad Metrics by keyword",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by keyword.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "keyword"],
    "destinationName": "reddit_ads_report_by_KEYWORD",
    "isTimeSeries": true
  },
  "report-by-PLACEMENT": {
    "overview": "User Ad Metrics by placement",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by placement.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "placement"],
    "destinationName": "reddit_ads_report_by_PLACEMENT",
    "isTimeSeries": true
  },
  "report-by-AD_ACCOUNT_ID": {
    "overview": "User Ad Metrics by account_id",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by account_id.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "account_id"],
    "destinationName": "reddit_ads_report_by_AD_ACCOUNT_ID",
    "isTimeSeries": true
  },
  "report-by-COMMUNITY": {
    "overview": "User Ad Metrics by community",
    "description": "Retrieve ad performance metrics and details from Reddit Ads API by community.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date", "community"],
    "destinationName": "reddit_ads_report_by_COMMUNITY",
    "isTimeSeries": true
  }
}
