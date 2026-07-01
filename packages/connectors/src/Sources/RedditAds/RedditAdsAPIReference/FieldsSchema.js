/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var RedditFieldsSchema = {
  "ad-account-user": {
    "overview": "Ad Account User",
    "description": "The authenticated Reddit Ads user — identity and contact details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Me",
    "fields": adAccountUserFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["email", "firstname", "lastname", "reddit_user_id", "reddit_username"],
    "destinationName": "reddit_ads_ad_account_user"
  },
  "ad-account": {
    "overview": "Ad Account",
    "description": "Your ad account settings — currency, attribution windows, and account type.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/Get%20Ad%20Account",
    "fields": adAccountFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "type", "currency", "attribution_type", "click_attribution_window", "view_attribution_window", "created_at", "modified_at"],
    "destinationName": "reddit_ads_ad_account"
  },
  "ad-group": {
    "overview": "Ad Groups",
    "description": "Ad groups within your campaigns — bid strategy, goal, targeting, and schedule.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Groups",
    "fields": adGroupFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "ad_account_id", "campaign_id", "configured_status", "effective_status", "bid_strategy", "bid_type", "goal_type", "start_time", "end_time", "is_campaign_budget_optimization"],
    "destinationName": "reddit_ads_ad_group",
    "parameters": {
      "pageSize": {
        "description": "Number of results to return per page",
        "type": DATA_TYPES.INTEGER,
        "default": 10
      }
    }
  },
  "ads": {
    "overview": "Ads",
    "description": "Individual ads — type, status, and links to their campaigns and posts.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ads",
    "fields": adsFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["ad_account_id", "campaign_id", "name"],
    "destinationName": "reddit_ads_ads"
  },
  "campaigns": {
    "overview": "Campaigns",
    "description": "Your campaigns — objective, status, spend cap, and account association.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Campaigns",
    "fields": campaignsFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["ad_account_id", "name"],
    "destinationName": "reddit_ads_campaigns"
  },
  "user-custom-audience": {
    "overview": "Custom Audiences",
    "description": "Custom audiences built from your user lists — type, status, and size estimates.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20User%20Custom%20Audiences",
    "fields": userCustomAudienceFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "type", "status", "ad_account_id", "size_range_lower", "size_range_upper"],
    "destinationName": "reddit_ads_user_custom_audience"
  },
  "funding-instruments": {
    "overview": "Funding Instruments",
    "description": "Payment methods linked to your campaigns — credit limits and current outstanding balance.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Funding%20Instruments",
    "fields": fundingInstrumentFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "currency", "credit_limit", "billable_amount", "is_servable"],
    "destinationName": "reddit_ads_funding_instruments"
  },
  "lead-gen-form": {
    "overview": "Lead Gen Forms",
    "description": "Lead generation forms shown in your ads — prompt text and creation details.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Lead%20Gen%20Forms",
    "fields": leadGenFormFields,
    "uniqueKeys": ["id"],
    "defaultFields": ["name", "ad_account_id", "prompt", "created_at"],
    "destinationName": "reddit_ads_lead_gen_form"
  },
  "report": {
    "overview": "Ad Performance",
    "description": "Daily ad performance — impressions, clicks, spend, conversions, and ROAS.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportFields,
    "uniqueKeys": ["ad_id", "date"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report",
    "isTimeSeries": true
  },
  "report-by-COUNTRY": {
    "overview": "Ad Performance by Country",
    "description": "Daily ad performance broken down by user country.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportCountryFields,
    "uniqueKeys": ["ad_id", "date", "country"],
    "defaultFields": ["clicks", "hour", "impressions", "post_id", "spend"],
    "destinationName": "reddit_ads_report_by_COUNTRY",
    "isTimeSeries": true
  },
  "report-by-AD_GROUP_ID": {
    "overview": "Ad Performance by Ad Group",
    "description": "Daily ad performance broken down by ad group.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportAdGroupIdFields,
    "uniqueKeys": ["ad_id", "date", "ad_group_id"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_AD_GROUP_ID",
    "isTimeSeries": true
  },
  "report-by-CAMPAIGN_ID": {
    "overview": "Ad Performance by Campaign",
    "description": "Daily ad performance broken down by campaign.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportCampaignIdFields,
    "uniqueKeys": ["ad_id", "date", "campaign_id"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_CAMPAIGN_ID",
    "isTimeSeries": true
  },
  "report-by-DMA": {
    "overview": "Ad Performance by DMA",
    "description": "Daily ad performance broken down by Designated Market Area (DMA).",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportDmaBasedFields,
    "uniqueKeys": ["ad_id", "date", "dma"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_DMA",
    "isTimeSeries": true
  },
  "report-by-INTEREST": {
    "overview": "Ad Performance by Interest",
    "description": "Daily ad performance broken down by user interest targeting.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportInterestFields,
    "uniqueKeys": ["ad_id", "date", "interest"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_INTEREST",
    "isTimeSeries": true
  },
  "report-by-KEYWORD": {
    "overview": "Ad Performance by Keyword",
    "description": "Daily ad performance broken down by keyword.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportKeywordFields,
    "uniqueKeys": ["ad_id", "date", "keyword"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_KEYWORD",
    "isTimeSeries": true
  },
  "report-by-PLACEMENT": {
    "overview": "Ad Performance by Placement",
    "description": "Daily ad performance broken down by ad placement.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportPlacementFields,
    "uniqueKeys": ["ad_id", "date", "placement"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_PLACEMENT",
    "isTimeSeries": true
  },
  "report-by-AD_ACCOUNT_ID": {
    "overview": "Ad Performance by Account",
    "description": "Daily ad performance broken down by ad account.",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportAdAccountIdFields,
    "uniqueKeys": ["ad_id", "date", "account_id"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_AD_ACCOUNT_ID",
    "isTimeSeries": true
  },
  "report-by-COMMUNITY": {
    "overview": "Ad Performance by Community",
    "description": "Daily ad performance broken down by subreddit (community).",
    "documentation": "https://ads-api.reddit.com/docs/v3/operations/List%20Ad%20Metrics",
    "fields": reportCommunityFields,
    "uniqueKeys": ["ad_id", "date", "community"],
    "defaultFields": ["impressions", "clicks", "spend", "ctr", "cpc", "ecpm", "reach", "frequency", "key_conversion_total_count", "key_conversion_ecpa", "conversion_purchase_clicks", "conversion_purchase_total_value", "conversion_roas"],
    "destinationName": "reddit_ads_report_by_COMMUNITY",
    "isTimeSeries": true
  }
}
