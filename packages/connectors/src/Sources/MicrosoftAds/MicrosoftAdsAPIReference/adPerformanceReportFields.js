/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adPerformanceReportFields = {
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
  'AdId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad.',
    'type': DATA_TYPES.STRING
  },
  'AdGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad group.',
    'type': DATA_TYPES.STRING
  },
  'AdTitle': {
    'description': 'The ad title.',
    'type': DATA_TYPES.STRING
  },
  'AdDescription': {
    'description': 'The first ad description that appears below the path in your ad.',
    'type': DATA_TYPES.STRING
  },
  'AdDescription2': {
    'description': 'The second ad description that appears below the path in your ad.',
    'type': DATA_TYPES.STRING
  },
  'AdType': {
    'description': 'The ad type.',
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
    'type': DATA_TYPES.NUMBER,
  },
  'AveragePosition': {
    'description': 'The average position of the ad on a webpage.',
    'type': DATA_TYPES.NUMBER
  },
  'Conversions': {
    'description': 'The number of conversions.',
    'type': DATA_TYPES.INTEGER
  },
  'ConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': DATA_TYPES.NUMBER
  },
  'CostPerConversion': {
    'description': 'The cost per conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'DestinationUrl': {
    'description': 'The destination URL attribute of the ad.',
    'type': DATA_TYPES.STRING
  },
  'DeviceType': {
    'description': 'The type of device which showed ads.',
    'type': DATA_TYPES.STRING
  },
  'Language': {
    'description': 'The language of the publisher where the ad was shown.',
    'type': DATA_TYPES.STRING
  },
  'DisplayUrl': {
    'description': 'The ad display URL.',
    'type': DATA_TYPES.STRING
  },
  'AdStatus': {
    'description': 'The ad status.',
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
  'BidMatchType': {
    'description': 'The keyword bid match type.',
    'type': DATA_TYPES.STRING
  },
  'DeliveredMatchType': {
    'description': 'The match type used to deliver an ad.',
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
  'Revenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': DATA_TYPES.STRING
  },
  'ReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
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
  'TrackingTemplate': {
    'description': 'The current tracking template of the ad.',
    'type': DATA_TYPES.STRING
  },
  'CustomParameters': {
    'description': 'The current custom parameters set of the ad.',
    'type': DATA_TYPES.STRING
  },
  'FinalUrl': {
    'description': 'The Final URL of the ad.',
    'type': DATA_TYPES.STRING
  },
  'FinalMobileUrl': {
    'description': 'The Final Mobile URL of the ad.',
    'type': DATA_TYPES.STRING
  },
  'FinalAppUrl': {
    'description': 'Reserved for future use.',
    'type': DATA_TYPES.STRING
  },
  'AccountStatus': {
    'description': 'The account status.',
    'type': DATA_TYPES.STRING
  },
  'CampaignStatus': {
    'description': 'The campaign status.',
    'type': DATA_TYPES.STRING
  },
  'AdGroupStatus': {
    'description': 'The ad group status.',
    'type': DATA_TYPES.STRING
  },
  'TitlePart1': {
    'description': 'The title part 1 attribute of an ad.',
    'type': DATA_TYPES.STRING
  },
  'TitlePart2': {
    'description': 'The title part 2 attribute of an ad.',
    'type': DATA_TYPES.STRING
  },
  'TitlePart3': {
    'description': 'The title part 3 attribute of an ad.',
    'type': DATA_TYPES.STRING
  },
  'Headline': {
    'description': 'The shorter of two possible responsive ad headlines.',
    'type': DATA_TYPES.STRING
  },
  'LongHeadline': {
    'description': 'The longer of two possible responsive ad headlines.',
    'type': DATA_TYPES.STRING
  },
  'BusinessName': {
    'description': 'Depending on your responsive ad\'s placement, your business\'s name may appear in your ad.',
    'type': DATA_TYPES.STRING
  },
  'Path1': {
    'description': 'The path 1 attribute of an ad.',
    'type': DATA_TYPES.STRING
  },
  'Path2': {
    'description': 'The path 2 attribute of an ad.',
    'type': DATA_TYPES.STRING
  },
  'AdLabels': {
    'description': 'The labels applied to the ad.',
    'type': DATA_TYPES.STRING
  },
  'CustomerId': {
    'description': 'The Microsoft Advertising assigned identifier of a customer.',
    'type': DATA_TYPES.INTEGER
  },
  'CustomerName': {
    'description': 'The customer name.',
    'type': DATA_TYPES.STRING
  },
  'CampaignType': {
    'description': 'The campaign type.',
    'type': DATA_TYPES.STRING
  },
  'BaseCampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of an experiment campaign.',
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
  'FinalUrlSuffix': {
    'description': 'A place in your final URL where you can add parameters that will be attached to the end of your landing page URL.',
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
  'ViewThroughRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of view-through conversions.',
    'type': DATA_TYPES.STRING
  },
  'VideoViews': {
    'description': 'The number of times the video was played and watched for at least two continuous seconds with more than 50% of the screen in view.',
    'type': DATA_TYPES.INTEGER
  },
  'ViewThroughRate': {
    'description': 'The number of video views divided by the number of impressions.',
    'type': DATA_TYPES.NUMBER
  },
  'AverageCPV': {
    'description': 'Average total spend divided by video views.',
    'type': DATA_TYPES.NUMBER
  },
  'VideoViewsAt25Percent': {
    'description': 'The number of times a person completed at least 25% of a video.',
    'type': DATA_TYPES.INTEGER
  },
  'VideoViewsAt50Percent': {
    'description': 'The number of times a person completed at least 50% of a video.',
    'type': DATA_TYPES.INTEGER
  },
  'VideoViewsAt75Percent': {
    'description': 'The number of times a person completed at least 75% of a video.',
    'type': DATA_TYPES.INTEGER
  },
  'CompletedVideoViews': {
    'description': 'Number of times a person watched the entire video to completion.',
    'type': DATA_TYPES.INTEGER
  },
  'VideoCompletionRate': {
    'description': 'The number of completed video views divided by the total number of impressions, multiplied by 100.',
    'type': DATA_TYPES.INTEGER
  },
  'TotalWatchTimeInMS': {
    'description': 'Total amount of time a person spent watching the video in milliseconds.',
    'type': DATA_TYPES.DATE
  },
  'AverageWatchTimePerVideoView': {
    'description': 'Total watch time divided by the number of video views.',
    'type': DATA_TYPES.INTEGER
  },
  'AverageWatchTimePerImpression': {
    'description': 'Total watch time, in milliseconds, divided by the number of impressions.',
    'type': DATA_TYPES.NUMBER
  },
  'AdStrength': {
    'description': 'The ad strength score of responsive search ads.',
    'type': DATA_TYPES.STRING
  },
  'AdStrengthActionItems': {
    'description': 'The suggestion based on ad strength of your responsive search ads.',
    'type': DATA_TYPES.STRING
  },
  'GoalId': {
    'description': 'The Microsoft Advertising assigned identifier of a conversion goal.',
    'type': DATA_TYPES.INTEGER
  }
};
