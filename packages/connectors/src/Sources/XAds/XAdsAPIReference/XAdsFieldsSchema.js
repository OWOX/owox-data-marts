/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var XAdsFieldsSchema = {
  accounts: {
    overview: "Accounts",
    description: "Advertising accounts — name, business, country, timezone, and approval status.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/account-structure",
    fields: accountFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "business_name"],
    destinationName: "x_ads_accounts"
  },
  campaigns: {
    overview: "Campaigns",
    description: "Your campaigns — status, budget optimization, daily and total budget, and currency.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/campaign-management",
    fields: campaignFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "currency", "account_id"],
    destinationName: "x_ads_campaigns"
  },
  line_items: {
    overview: "Line Items",
    description: "Line items within campaigns — bid strategy, goal, product type, budget, and schedule.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/line-items",
    fields: lineItemFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "campaign_id"],
    destinationName: "x_ads_line_items"
  },
  promoted_tweets: {
    overview: "Promoted Tweets",
    description: "Tweets promoted as ads — status, approval, and links to their tweets and line items.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/promoted-tweets",
    fields: promotedTweetFields,
    uniqueKeys: ["id"],
    defaultFields: ["tweet_id", "line_item_id"],
    destinationName: "x_ads_promoted_tweets",
    requiredFields: ["id"]
  },
  tweets: {
    overview: "Tweets",
    description: "Original tweets used as ad creatives — text, type, language, engagement counts, and card URI.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/tweets",
    fields: tweetFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "id_str", "card_uri"],
    destinationName: "x_ads_tweets",
    requiredFields: ["card_uri"]
  },
  stats: {
    overview: "Ad Performance",
    description: "Daily ad performance by placement — impressions, clicks, spend, engagements, and social actions.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/stats",
    fields: statsFields,
    uniqueKeys: ["id", "date", "placement"],
    defaultFields: ["impressions", "billed_charge_local_micro", "url_clicks"],
    destinationName: "x_ads_stats",
    isTimeSeries: true
  },
  stats_by_country: {
    overview: "Ad Performance by Country",
    description: "Daily ad performance broken down by country — impressions, clicks, spend, engagements, and social actions.",
    documentation: "https://developer.x.com/en/docs/x-ads-api/analytics/api-reference/asynchronous",
    fields: statsByCountryFields,
    uniqueKeys: ["id", "date", "placement", "country"],
    defaultFields: ["impressions", "clicks", "url_clicks", "engagements", "billed_charge_local_micro", "likes", "retweets", "replies", "follows"],
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
    overview: "Targeting Locations",
    description: "Reference table of location IDs with names and country codes — join targeting_value with the country field in Ad Performance by Country.",
    documentation: "https://developer.x.com/en/docs/x-ads-api/campaign-management/api-reference/targeting-criteria",
    fields: targetingLocationsFields,
    uniqueKeys: ["targeting_value"],
    defaultFields: ["name", "location_type", "country_code"],
    destinationName: "x_ads_targeting_locations"
  },
  cards: {
    overview: "Cards",
    description: "Website and app cards — type, URI, and components.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "card_uri", "components"],
    destinationName: "x_ads_cards"
  },
  cards_all: {
    overview: "All Cards",
    description: "All card types with full creative details — type, title, destination URL, call to action, and media.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardAllFields,
    uniqueKeys: ["id"],
    defaultFields: ["name", "card_type", "card_uri", "title", "website_url", "app_cta", "country_code", "created_at", "updated_at"],
    destinationName: "x_ads_cards_all"
  }
};
