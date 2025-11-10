/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var userLocationPerformanceReportFields = {
  'AccountName': {
    'description': 'The account name.',
    'type': 'String'
  },
  'AccountNumber': {
    'description': 'The Microsoft Advertising assigned number of an account.',
    'type': 'String'
  },
  'AccountId': {
    'description': 'The Microsoft Advertising assigned identifier of an account.',
    'type': 'string'
  },
  'TimePeriod': {
    'description': 'The time period of each report row.',
    'type': 'Date',
    'GoogleBigQueryType': 'date',
    'GoogleBigQueryPartitioned': true,
    'GoogleSheetsFormat': '@'
  },
  'CampaignName': {
    'description': 'The campaign name.',
    'type': 'String'
  },
  'CampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of a campaign.',
    'type': 'string'
  },
  'AdGroupName': {
    'description': 'The ad group name.',
    'type': 'String'
  },
  'AdGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad group.',
    'type': 'string'
  },
  'Country': {
    'description': 'The country where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'State': {
    'description': 'The state where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'MetroArea': {
    'description': 'The metro area where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'CurrencyCode': {
    'description': 'The account currency type.',
    'type': 'string'
  },
  'AdDistribution': {
    'description': 'The network where you want your ads to show.',
    'type': 'string'
  },
  'Impressions': {
    'description': 'The number of times an ad has been displayed on search results pages.',
    'type': 'Int64'
  },
  'Clicks': {
    'description': 'Clicks are what you pay for.',
    'type': 'Int64'
  },
  'Ctr': {
    'description': 'The click-through rate (CTR) is the number of times an ad was clicked, divided by the number of times the ad was shown.',
    'type': 'Double'
  },
  'AverageCpc': {
    'description': 'The average cost per click (CPC).',
    'type': 'Double'
  },
  'Spend': {
    'description': 'The cost per click (CPC) summed for each click.',
    'type': 'Double',
    'GoogleSheetsFormat': '$#,##0.00'
  },
  'AveragePosition': {
    'description': 'The average position of the ad on a webpage.',
    'type': 'Double'
  },
  'ProximityTargetLocation': {
    'description': 'The location being targeted.',
    'type': 'String'
  },
  'Radius': {
    'description': 'The radius of the location target.',
    'type': 'String'
  },
  'Language': {
    'description': 'The language of the publisher where the ad was shown.',
    'type': 'String'
  },
  'City': {
    'description': 'The city where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'QueryIntentCountry': {
    'description': 'The country that the user was searching for.',
    'type': 'String'
  },
  'QueryIntentState': {
    'description': 'The state that the user was searching for.',
    'type': 'String'
  },
  'QueryIntentCity': {
    'description': 'The city that the user was searching for.',
    'type': 'String'
  },
  'QueryIntentDMA': {
    'description': 'The DMA that the user was searching for.',
    'type': 'String'
  },
  'BidMatchType': {
    'description': 'The keyword bid match type.',
    'type': 'string'
  },
  'DeliveredMatchType': {
    'description': 'The match type used to deliver an ad.',
    'type': 'string'
  },
  'Network': {
    'description': 'The entire Microsoft Advertising Network made up of Microsoft sites and select traffic, and only partner traffic.',
    'type': 'String'
  },
  'TopVsOther': {
    'description': 'Indicates whether the ad impression appeared in a top position or elsewhere.',
    'type': 'string'
  },
  'DeviceType': {
    'description': 'The type of device which showed ads.',
    'type': 'string'
  },
  'DeviceOS': {
    'description': 'The operating system of the device reported in the DeviceType column.',
    'type': 'string'
  },
  'Assists': {
    'description': 'The number of conversions from other ads within the same account that were preceded by one or more clicks from this ad.',
    'type': 'String'
  },
  'Conversions': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'ConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': 'Double'
  },
  'Revenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': 'String'
  },
  'ReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': 'Double'
  },
  'CostPerConversion': {
    'description': 'The cost per conversion.',
    'type': 'Double'
  },
  'CostPerAssist': {
    'description': 'The cost per assist.',
    'type': 'Double'
  },
  'RevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': 'String'
  },
  'RevenuePerAssist': {
    'description': 'The revenue per assist.',
    'type': 'String'
  },
  'County': {
    'description': 'The county where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'PostalCode': {
    'description': 'The postal code where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'QueryIntentCounty': {
    'description': 'The county that the user was searching for.',
    'type': 'String'
  },
  'QueryIntentPostalCode': {
    'description': 'The postal code that the user was searching for.',
    'type': 'String'
  },
  'LocationId': {
    'description': 'The Microsoft Advertising identifier of the location where the user was physically located when they clicked the ad.',
    'type': 'string'
  },
  'QueryIntentLocationId': {
    'description': 'The Microsoft Advertising identifier of the location that the user was searching for.',
    'type': 'Int64'
  },
  'AllConversions': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'AllRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': 'String'
  },
  'AllConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': 'Double'
  },
  'AllCostPerConversion': {
    'description': 'The cost per conversion.',
    'type': 'Double'
  },
  'AllReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': 'Double'
  },
  'AllRevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': 'String'
  },
  'ViewThroughConversions': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': 'Int64'
  },
  'Goal': {
    'description': 'The name of the goal you set for the conversions you want.',
    'type': 'String'
  },
  'GoalType': {
    'description': 'The type of conversion goal.',
    'type': 'String'
  },
  'AbsoluteTopImpressionRatePercent': {
    'description': 'How often your ad was in the first position of all results, as a percentage of your total impressions.',
    'type': 'Double'
  },
  'TopImpressionRatePercent': {
    'description': 'The percentage of times your ad showed in the mainline, the top placement where ads appear above the search results.',
    'type': 'Double'
  },
  'AverageCpm': {
    'description': 'The total advertising cost divided by the number of impressions (in thousands).',
    'type': 'Double'
  },
  'ConversionsQualified': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'AllConversionsQualified': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'ViewThroughConversionsQualified': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': 'Int64'
  },
  'Neighborhood': {
    'description': 'The neighborhood where the user was located when they clicked the ad.',
    'type': 'String'
  },
  'QueryIntentNeighborhood': {
    'description': 'The neighborhood that the user was searching for.',
    'type': 'String'
  },
  'ViewThroughRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of view-through conversions.',
    'type': 'String'
  },
  'CampaignType': {
    'description': 'The campaign type.',
    'type': 'string'
  },
  'AssetGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an asset group.',
    'type': 'string'
  },
  'AssetGroupName': {
    'description': 'The asset group name.',
    'type': 'String'
  },
  'Downloads': {
    'description': 'The number of downloads.',
    'type': 'Int64'
  },
  'PostClickDownloadRate': {
    'description': 'The download rate after click.',
    'type': 'Double'
  },
  'CostPerDownload': {
    'description': 'The cost per download.',
    'type': 'Double'
  },
  'AppInstalls': {
    'description': 'The number of app installs.',
    'type': 'Int64'
  },
  'PostClickInstallRate': {
    'description': 'The install rate after click.',
    'type': 'Double'
  },
  'CPI': {
    'description': 'Cost per install.',
    'type': 'Double'
  },
  'Purchases': {
    'description': 'The number of purchases.',
    'type': 'Int64'
  },
  'PostInstallPurchaseRate': {
    'description': 'The purchase rate after install.',
    'type': 'Double'
  },
  'CPP': {
    'description': 'Cost per purchase.',
    'type': 'Double'
  },
  'Subscriptions': {
    'description': 'The number of subscriptions.',
    'type': 'Int64'
  },
  'PostInstallSubscriptionRate': {
    'description': 'The subscription rate after install.',
    'type': 'Double'
  },
  'CPS': {
    'description': 'Cost per subscription.',
    'type': 'Double'
  }
};
