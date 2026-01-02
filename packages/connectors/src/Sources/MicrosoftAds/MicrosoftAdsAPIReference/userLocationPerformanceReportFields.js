/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var userLocationPerformanceReportFields = {
  'AccountName': {
    'description': 'The account name.',
    'type': DATA_TYPES.STRING 
  },
  'AccountNumber': {
    'description': 'The Microsoft Advertising assigned number of an account.',
    'type': DATA_TYPES.STRING
  },
  'AccountId': {
    'description': 'The Microsoft Advertising assigned identifier of an account.',
    'type': DATA_TYPES.STRING
  },
  'TimePeriod': {
    'description': 'The time period of each report row.',
    'type': DATA_TYPES.DATE,
    'GoogleBigQueryPartitioned': true
  },
  'CampaignName': {
    'description': 'The campaign name.',
    'type': DATA_TYPES.STRING
  },
  'CampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of a campaign.',
    'type': DATA_TYPES.STRING
  },
  'AdGroupName': {
    'description': 'The ad group name.',
    'type': DATA_TYPES.STRING
  },
  'AdGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad group.',
    'type': DATA_TYPES.STRING
  },
  'Country': {
    'description': 'The country where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'State': {
    'description': 'The state where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'MetroArea': {
    'description': 'The metro area where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'CurrencyCode': {
    'description': 'The account currency type.',
    'type': DATA_TYPES.STRING
  },
  'AdDistribution': {
    'description': 'The network where you want your ads to show.',
    'type': DATA_TYPES.STRING
  },
  'Impressions': {
    'description': 'The number of times an ad has been displayed on search results pages.',
    'type': DATA_TYPES.INTEGER
  },
  'Clicks': {
    'description': 'Clicks are what you pay for.',
    'type': DATA_TYPES.INTEGER
  },
  'Ctr': {
    'description': 'The click-through rate (CTR) is the number of times an ad was clicked, divided by the number of times the ad was shown.',
    'type': DATA_TYPES.NUMBER
  },
  'AverageCpc': {
    'description': 'The average cost per click (CPC).',
    'type': DATA_TYPES.NUMBER
  },
  'Spend': {
    'description': 'The cost per click (CPC) summed for each click.',
    'type': DATA_TYPES.NUMBER
  },
  'AveragePosition': {
    'description': 'The average position of the ad on a webpage.',
    'type': DATA_TYPES.NUMBER
  },
  'ProximityTargetLocation': {
    'description': 'The location being targeted.',
    'type': DATA_TYPES.STRING
  },
  'Radius': {
    'description': 'The radius of the location target.',
    'type': DATA_TYPES.STRING
  },
  'Language': {
    'description': 'The language of the publisher where the ad was shown.',
    'type': DATA_TYPES.STRING
  },
  'City': {
    'description': 'The city where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentCountry': {
    'description': 'The country that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentState': {
    'description': 'The state that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentCity': {
    'description': 'The city that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentDMA': {
    'description': 'The DMA that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'BidMatchType': {
    'description': 'The keyword bid match type.',
    'type': DATA_TYPES.STRING
  },
  'DeliveredMatchType': {
    'description': 'The match type used to deliver an ad.',
    'type': DATA_TYPES.STRING
  },
  'Network': {
    'description': 'The entire Microsoft Advertising Network made up of Microsoft sites and select traffic, and only partner traffic.',
    'type': DATA_TYPES.STRING
  },
  'TopVsOther': {
    'description': 'Indicates whether the ad impression appeared in a top position or elsewhere.',
    'type': DATA_TYPES.STRING
  },
  'DeviceType': {
    'description': 'The type of device which showed ads.',
    'type': DATA_TYPES.STRING
  },
  'DeviceOS': {
    'description': 'The operating system of the device reported in the DeviceType column.',
    'type': DATA_TYPES.STRING
  },
  'Assists': {
    'description': 'The number of conversions from other ads within the same account that were preceded by one or more clicks from this ad.',
    'type': DATA_TYPES.STRING
  },
  'Conversions': {
    'description': 'The number of conversions.',
    'type': DATA_TYPES.INTEGER
  },
  'ConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': DATA_TYPES.NUMBER
  },
  'Revenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': DATA_TYPES.STRING
  },
  'ReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': DATA_TYPES.NUMBER
  },
  'CostPerConversion': {
    'description': 'The cost per conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'CostPerAssist': {
    'description': 'The cost per assist.',
    'type': DATA_TYPES.NUMBER
  },
  'RevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': DATA_TYPES.STRING
  },
  'RevenuePerAssist': {
    'description': 'The revenue per assist.',
    'type': DATA_TYPES.STRING
  },
  'County': {
    'description': 'The county where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'PostalCode': {
    'description': 'The postal code where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentCounty': {
    'description': 'The county that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentPostalCode': {
    'description': 'The postal code that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'LocationId': {
    'description': 'The Microsoft Advertising identifier of the location where the user was physically located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentLocationId': {
    'description': 'The Microsoft Advertising identifier of the location that the user was searching for.',
    'type': DATA_TYPES.INTEGER
  },
  'AllConversions': {
    'description': 'The number of conversions.',
    'type': DATA_TYPES.INTEGER
  },
  'AllRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': DATA_TYPES.STRING
  },
  'AllConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': DATA_TYPES.NUMBER
  },
  'AllCostPerConversion': {
    'description': 'The cost per conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'AllReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': DATA_TYPES.NUMBER
  },
  'AllRevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': DATA_TYPES.STRING
  },
  'ViewThroughConversions': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': DATA_TYPES.INTEGER
  },
  'Goal': {
    'description': 'The name of the goal you set for the conversions you want.',
    'type': DATA_TYPES.STRING
  },
  'GoalType': {
    'description': 'The type of conversion goal.',
    'type': DATA_TYPES.STRING
  },
  'AbsoluteTopImpressionRatePercent': {
    'description': 'How often your ad was in the first position of all results, as a percentage of your total impressions.',
    'type': DATA_TYPES.NUMBER
  },
  'TopImpressionRatePercent': {
    'description': 'The percentage of times your ad showed in the mainline, the top placement where ads appear above the search results.',
    'type': DATA_TYPES.NUMBER
  },
  'AverageCpm': {
    'description': 'The total advertising cost divided by the number of impressions (in thousands).',
    'type': DATA_TYPES.NUMBER
  },
  'ConversionsQualified': {
    'description': 'The number of conversions.',
    'type': DATA_TYPES.INTEGER
  },
  'AllConversionsQualified': {
    'description': 'The number of conversions.',
    'type': DATA_TYPES.INTEGER
  },
  'ViewThroughConversionsQualified': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': DATA_TYPES.INTEGER
  },
  'Neighborhood': {
    'description': 'The neighborhood where the user was located when they clicked the ad.',
    'type': DATA_TYPES.STRING
  },
  'QueryIntentNeighborhood': {
    'description': 'The neighborhood that the user was searching for.',
    'type': DATA_TYPES.STRING
  },
  'ViewThroughRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of view-through conversions.',
    'type': DATA_TYPES.STRING
  },
  'CampaignType': {
    'description': 'The campaign type.',
    'type': DATA_TYPES.STRING
  },
  'AssetGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an asset group.',
    'type': DATA_TYPES.STRING
  },
  'AssetGroupName': {
    'description': 'The asset group name.',
    'type': DATA_TYPES.STRING
  },
  'Downloads': {
    'description': 'The number of downloads.',
    'type': DATA_TYPES.INTEGER
  },
  'PostClickDownloadRate': {
    'description': 'The download rate after click.',
    'type': DATA_TYPES.NUMBER
  },
  'CostPerDownload': {
    'description': 'The cost per download.',
    'type': DATA_TYPES.NUMBER
  },
  'AppInstalls': {
    'description': 'The number of app installs.',
    'type': DATA_TYPES.INTEGER
  },
  'PostClickInstallRate': {
    'description': 'The install rate after click.',
    'type': DATA_TYPES.NUMBER
  },
  'CPI': {
    'description': 'Cost per install.',
    'type': DATA_TYPES.NUMBER
  },
  'Purchases': {
    'description': 'The number of purchases.',
    'type': DATA_TYPES.INTEGER
  },
  'PostInstallPurchaseRate': {
    'description': 'The purchase rate after install.',
    'type': DATA_TYPES.NUMBER
  },
  'CPP': {
    'description': 'Cost per purchase.',
    'type': DATA_TYPES.NUMBER
  },
  'Subscriptions': {
    'description': 'The number of subscriptions.',
    'type': DATA_TYPES.INTEGER
  },
  'PostInstallSubscriptionRate': {
    'description': 'The subscription rate after install.',
    'type': DATA_TYPES.NUMBER
  },
  'CPS': {
    'description': 'Cost per subscription.',
    'type': DATA_TYPES.NUMBER
  }
};
