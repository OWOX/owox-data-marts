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
    uniqueKeys: ["id"]
  },
  campaigns: {
    overview: "X Ads Campaigns",
    description: "Ad campaigns with scheduling, targeting, budgeting and other settings.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/campaign-management",
    fields: campaignFields,
    uniqueKeys: ["id"]
  },
  line_items: {
    overview: "X Ads Line Items",
    description: "Line items within campaigns that define targeting and creative settings.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/line-items",
    fields: lineItemFields,
    uniqueKeys: ["id"]
  },
  promoted_tweets: {
    overview: "X Ads Promoted Tweets",
    description: "Tweets that are being promoted as ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/promoted-tweets",
    fields: promotedTweetFields,
    uniqueKeys: ["id"],
    requiredFields: ["id"]
  },
  tweets: {
    overview: "X Ads Tweets",
    description: "Original tweets that can be promoted as ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/tweets",
    fields: tweetFields,
    uniqueKeys: ["id"],
    requiredFields: ["card_uri"] 
  },
  stats: {
    overview: "X Ads Stats",
    description: "Statistics and metrics for X Ads entities.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/stats",
    fields: statsFields,
    uniqueKeys: ["id", "date", "placement"],
    isTimeSeries: true
  },
  cards: {
    overview: "X Ads Cards",
    description: "Website cards and app cards for X Ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardFields,
    uniqueKeys: ["id"]
  },
  cards_all: {
    overview: "X Ads All Cards",
    description: "All types of cards available for X Ads.",
    documentation: "https://developer.twitter.com/en/docs/twitter-ads-api/cards",
    fields: cardAllFields,
    uniqueKeys: ["id"]
  }
};
