/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var BingAdsFieldsSchema = {
  ad_performance_report: {
    overview: "Bing Ads Performance Report",
    description: "Performance metrics for ads in Bing Ads campaigns.",
    documentation: "https://learn.microsoft.com/en-us/advertising/reporting-service/adperformancereportrequest",
    fields: adPerformanceReportFields,
    uniqueKeys: [
      "AccountId",
      "CampaignId",
      "TimePeriod",
      "AdGroupId",
      "LocationId",
      "CampaignType",
      "BidMatchType",
      "DeliveredMatchType",
      "AssetGroupId",
      "CurrencyCode",
      "AdDistribution",
      "DeviceType",
      "DeviceOS",
      "TopVsOther"
    ],
    isTimeSeries: true
  },
  campaigns: {
    overview: "Bing Ads Campaigns",
    description: "Campaign data from Bing Ads API.",
    documentation: "https://learn.microsoft.com/en-us/advertising/bulk-service/bulk-service-reference",
    fields: campaignFields,
    uniqueKeys: ["Id"],
    isTimeSeries: false
  }
};
