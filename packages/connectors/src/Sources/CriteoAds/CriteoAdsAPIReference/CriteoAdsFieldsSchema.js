/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var CriteoAdsFieldsSchema = {
  statistics: {
    overview: "Criteo Statistics",
    description: "Statistics and metrics for Criteo advertising campaigns.",
    documentation: "https://developers.criteo.com/marketing-solutions/docs/campaign-statistics",
    fields: adStatisticsFields,
    uniqueKeys: ["CampaignId", "AdvertiserId", "AdsetId", "AdId", "Day"],
    defaultFields: ["Clicks", "Displays", "AdvertiserCost", "Campaign", "Advertiser", "Adset", "Ad", "Currency"],
    destinationName: "criteo_ads_statistics",
    isTimeSeries: true
  },
  placements: {
    overview: "Criteo Placements",
    description: "Performance metrics broken down by publisher placement.",
    documentation: "https://developers.criteo.com/marketing-solutions/docs/placement",
    fields: placementFields,
    uniqueKeys: ["advertiserId", "adsetId", "day", "environment", "placement"],
    defaultFields: ["advertiserId", "adsetId", "adsetName", "environment", "placement", "clicks", "displays", "cost"],
    destinationName: "criteo_ads_placements",
    isTimeSeries: true,
    injectDay: true
  },
  placement_categories: {
    overview: "Criteo Placement Categories",
    description: "Performance metrics broken down by content category.",
    documentation: "https://developers.criteo.com/marketing-solutions/docs/placement-category",
    fields: placementCategoryFields,
    uniqueKeys: ["advertiserId", "day", "categoryId"],
    defaultFields: ["advertiserId", "categoryId", "categoryName", "displays", "clicks", "salesPc30d"],
    destinationName: "criteo_ads_placement_categories",
    isTimeSeries: true,
    injectDay: true
  },
  transactions: {
    overview: "Criteo Transactions",
    description: "Transaction-level data with individual order details attributed to Criteo ads.",
    documentation: "https://developers.criteo.com/marketing-solutions/docs/transaction-ids",
    fields: transactionFields,
    uniqueKeys: ["advertiserId", "transactionId"],
    defaultFields: ["transactionId", "transactionDate", "advertiserId", "adsetName", "eventType", "amount", "currency"],
    destinationName: "criteo_ads_transactions",
    isTimeSeries: true
  }
};
