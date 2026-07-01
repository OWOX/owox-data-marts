/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var MicrosoftAdsFieldsSchema = {
  ad_performance_report: {
    overview: "Ad Performance Report",
    description: "Daily ad performance — impressions, clicks, spend, and conversions segmented by device, network, and match type.",
    documentation: "https://learn.microsoft.com/en-us/advertising/reporting-service/adperformancereportrequest",
    reportType: "AdPerformanceReportRequest",
    fields: adPerformanceReportFields,
    uniqueKeys: [
      "AccountId",
      "CampaignId",
      "AdGroupId",
      "AdId",
      "TimePeriod",
      "CurrencyCode",
      "AdDistribution",
      "DeviceType",
      "DeviceOS",
      "Network",
      "TopVsOther",
      "BidMatchType",
      "DeliveredMatchType",
      "Language",
      "CampaignType"
    ],
    defaultFields: ["TimePeriod", "AccountId", "AccountName", "CampaignId", "CampaignName", "CampaignType", "AdGroupId", "AdGroupName", "AdId", "AdType", "AdStatus", "AdDistribution", "DeviceType", "Network", "Impressions", "Clicks", "Spend", "Conversions", "Ctr", "AverageCpc", "CostPerConversion"],
    destinationName: "microsoft_ads_ad_performance_report",
    isTimeSeries: true
  },
  user_location_performance_report: {
    overview: "User Location Performance Report",
    description: "Daily performance by user physical location — impressions, clicks, spend, and conversions broken down by country, state, and city.",
    documentation: "https://learn.microsoft.com/en-us/advertising/reporting-service/userlocationperformancereportrequest",
    reportType: "UserLocationPerformanceReportRequest",
    fields: userLocationPerformanceReportFields,
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
    defaultFields: [
      "AccountName",
      "CampaignName",
      "AdGroupName",
      "Country",
      "Impressions",
      "Clicks",
      "Spend",
      "AssetGroupName"
    ],
    destinationName: "microsoft_ads_user_location_performance_report",
    isTimeSeries: true
  },
  campaigns: {
    overview: "Microsoft Ads Campaigns",
    description: "Your campaign and ad group structure — type, status, bid strategy, budget, and keyword settings.",
    documentation: "https://learn.microsoft.com/en-us/advertising/bulk-service/bulk-service-reference",
    fields: campaignFields,
    uniqueKeys: ["Id"],
    defaultFields: [
      "Type",
      "ParentId",
      "CampaignId",
      "Campaign",
      "CampaignType",
      "AdGroup",
      "AdGroupType",
      "Keyword"
    ],
    destinationName: "microsoft_ads_campaigns",
    isTimeSeries: false
  }
};
