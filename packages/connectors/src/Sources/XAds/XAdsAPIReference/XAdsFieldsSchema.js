/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var XAdsFieldsSchema = {
  accounts: {
    overview: "X Ads Accounts",
    description: "Advertising accounts for an organization.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/account-structure",
    fields: accountFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "name", "business_name", "country_code", "timezone", "industry_type", "approval_status", "created_at", "updated_at"],
    destinationName: "x_ads_accounts"
  },
  campaigns: {
    overview: "X Ads Campaigns",
    description: "Ad campaigns with scheduling, targeting, budgeting and other settings.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/campaign-management",
    fields: campaignFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "name", "account_id", "entity_status", "effective_status", "budget_optimization", "daily_budget_amount_local_micro", "total_budget_amount_local_micro", "currency", "created_at", "updated_at"],
    destinationName: "x_ads_campaigns"
  },
  line_items: {
    overview: "X Ads Line Items",
    description: "Line items within campaigns that define targeting and creative settings.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/line-items",
    fields: lineItemFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "name", "campaign_id", "entity_status", "product_type", "objective", "goal", "bid_strategy", "bid_amount_local_micro", "daily_budget_amount_local_micro", "total_budget_amount_local_micro", "start_time", "end_time", "created_at", "updated_at"],
    destinationName: "x_ads_line_items"
  },
  promoted_tweets: {
    overview: "X Ads Promoted Tweets",
    description: "Tweets that are being promoted as ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/promoted-tweets",
    fields: promotedTweetFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "tweet_id", "line_item_id", "entity_status", "approval_status", "created_at", "updated_at"],
    destinationName: "x_ads_promoted_tweets",
    requiredFields: ["id"]
  },
  tweets: {
    overview: "X Ads Tweets",
    description: "Original tweets that can be promoted as ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/tweets",
    fields: tweetFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "id_str", "full_text", "tweet_type", "lang", "created_at", "favorite_count", "retweet_count", "nullcast", "card_uri"],
    destinationName: "x_ads_tweets",
    requiredFields: ["card_uri"]
  },
  stats: {
    overview: "X Ads Stats",
    description: "Statistics and metrics for X Ads entities.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/stats",
    fields: statsFields,
    uniqueKeys: ["id", "date", "placement"],
    defaultFields: ["id", "date", "placement", "impressions", "clicks", "url_clicks", "engagements", "billed_charge_local_micro", "likes", "retweets", "replies", "follows"],
    destinationName: "x_ads_stats",
    isTimeSeries: true
  },
  stats_by_country: {
    overview: "X Ads Stats by Country",
    description: "Daily stats for promoted tweets broken down by location segment (country-level).",
    documentation: "https://developer.x.com/en/docs/x-ads-api/analytics/api-reference/asynchronous",
    fields: statsByCountryFields,
    uniqueKeys: ["id", "date", "placement", "country"],
    defaultFields: ["id", "date", "placement", "country", "impressions", "clicks", "url_clicks", "engagements", "billed_charge_local_micro", "likes", "retweets", "replies", "follows"],
    destinationName: "x_ads_stats_by_country",
    isTimeSeries: true,
    // asyncTimeSeries: uses the X Ads async jobs API (submit → poll → download
    // per job, sequentially). The Connector saves and advances the cursor after
    // each date completes via the onBatchReady callback.
    asyncTimeSeries: true,
    // segmentationType: the value sent to the X Ads API as segmentation_type.
    // segmentField: the output field name where segment_value is stored in the row.
    // To add a new segmentation (e.g. stats_by_device), create a new schema entry
    // with segmentationType: 'DEVICES' and segmentField: 'device'.
    segmentationType: 'LOCATIONS',
    segmentField: 'country'
  },
  targeting_locations: {
    overview: "X Ads Targeting Locations",
    description: "Reference table mapping location hex IDs to human-readable names and country codes. Run once to get a lookup table; join targeting_value with the country field in stats_by_country.",
    documentation: "https://developer.x.com/en/docs/x-ads-api/campaign-management/api-reference/targeting-criteria",
    fields: targetingLocationsFields,
    defaultFields: ["targeting_value", "name", "location_type", "country_code"],
    uniqueKeys: ["targeting_value"],
    destinationName: "x_ads_targeting_locations"
  },
  cards: {
    overview: "X Ads Cards",
    description: "Website cards and app cards for X Ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "name", "card_type", "card_uri", "created_at", "updated_at"],
    destinationName: "x_ads_cards"
  },
  cards_all: {
    overview: "X Ads All Cards",
    description: "All types of cards available for X Ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardAllFields,
    uniqueKeys: ["id"],
    defaultFields: ["id", "name", "card_type", "card_uri", "title", "website_url", "app_cta", "country_code", "created_at", "updated_at"],
    destinationName: "x_ads_cards_all"
  }
};
