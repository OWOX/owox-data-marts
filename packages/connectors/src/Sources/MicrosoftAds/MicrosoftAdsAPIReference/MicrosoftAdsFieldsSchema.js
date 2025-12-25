/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var MicrosoftAdsFieldsSchema = {
  ad_performance_report: {
    overview: "Ad Performance Report",
    description: "Performance metrics for ads in Microsoft Ads campaigns.",
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
    destinationName: "microsoft_ads_ad_performance_report",
    isTimeSeries: true
  },
  user_location_performance_report: {
    overview: "User Location Performance Report",
    description: "Performance metrics by user location for Microsoft Ads campaigns.",
    documentation: "https://learn.microsoft.com/en-us/advertising/reporting-service/userlocationperformancereportrequest",
    reportType: "UserLocationPerformanceReportRequest",
    fields: userLocationPerformanceReportFields,
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
    destinationName: "microsoft_ads_user_location_performance_report",
    isTimeSeries: true
  },
  campaigns: {
    overview: "Microsoft Ads Campaigns",
    description: "Campaign data from Microsoft Ads API.",
    documentation: "https://learn.microsoft.com/en-us/advertising/bulk-service/bulk-service-reference",
    fields: campaignFields,
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
    uniqueKeys: ["Id"],
    destinationName: "microsoft_ads_campaigns",
    isTimeSeries: false
  }
};
