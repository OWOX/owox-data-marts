/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adPerformanceReportFields = {
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
  'AdId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad.',
    'type': 'string'
  },
  'AdGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad group.',
    'type': 'string'
  },
  'AdTitle': {
    'description': 'The ad title.',
    'type': 'String'
  },
  'AdDescription': {
    'description': 'The first ad description that appears below the path in your ad.',
    'type': 'String'
  },
  'AdDescription2': {
    'description': 'The second ad description that appears below the path in your ad.',
    'type': 'String'
  },
  'AdType': {
    'description': 'The ad type.',
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
  'Conversions': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'ConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': 'Double'
  },
  'CostPerConversion': {
    'description': 'The cost per conversion.',
    'type': 'Double'
  },
  'DestinationUrl': {
    'description': 'The destination URL attribute of the ad.',
    'type': 'String'
  },
  'DeviceType': {
    'description': 'The type of device which showed ads.',
    'type': 'string'
  },
  'Language': {
    'description': 'The language of the publisher where the ad was shown.',
    'type': 'string'
  },
  'DisplayUrl': {
    'description': 'The ad display URL.',
    'type': 'String'
  },
  'AdStatus': {
    'description': 'The ad status.',
    'type': 'String'
  },
  'Network': {
    'description': 'The entire Microsoft Advertising Network made up of Microsoft sites and select traffic, and only partner traffic.',
    'type': 'string'
  },
  'TopVsOther': {
    'description': 'Indicates whether the ad impression appeared in a top position or elsewhere.',
    'type': 'string'
  },
  'BidMatchType': {
    'description': 'The keyword bid match type.',
    'type': 'string'
  },
  'DeliveredMatchType': {
    'description': 'The match type used to deliver an ad.',
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
  'Revenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': 'String'
  },
  'ReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
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
  'TrackingTemplate': {
    'description': 'The current tracking template of the ad.',
    'type': 'String'
  },
  'CustomParameters': {
    'description': 'The current custom parameters set of the ad.',
    'type': 'String'
  },
  'FinalUrl': {
    'description': 'The Final URL of the ad.',
    'type': 'String'
  },
  'FinalMobileUrl': {
    'description': 'The Final Mobile URL of the ad.',
    'type': 'String'
  },
  'FinalAppUrl': {
    'description': 'Reserved for future use.',
    'type': 'String'
  },
  'AccountStatus': {
    'description': 'The account status.',
    'type': 'String'
  },
  'CampaignStatus': {
    'description': 'The campaign status.',
    'type': 'String'
  },
  'AdGroupStatus': {
    'description': 'The ad group status.',
    'type': 'String'
  },
  'TitlePart1': {
    'description': 'The title part 1 attribute of an ad.',
    'type': 'String'
  },
  'TitlePart2': {
    'description': 'The title part 2 attribute of an ad.',
    'type': 'String'
  },
  'TitlePart3': {
    'description': 'The title part 3 attribute of an ad.',
    'type': 'String'
  },
  'Headline': {
    'description': 'The shorter of two possible responsive ad headlines.',
    'type': 'String'
  },
  'LongHeadline': {
    'description': 'The longer of two possible responsive ad headlines.',
    'type': 'String'
  },
  'BusinessName': {
    'description': 'Depending on your responsive ad\'s placement, your business\'s name may appear in your ad.',
    'type': 'String'
  },
  'Path1': {
    'description': 'The path 1 attribute of an ad.',
    'type': 'String'
  },
  'Path2': {
    'description': 'The path 2 attribute of an ad.',
    'type': 'String'
  },
  'AdLabels': {
    'description': 'The labels applied to the ad.',
    'type': 'String'
  },
  'CustomerId': {
    'description': 'The Microsoft Advertising assigned identifier of a customer.',
    'type': 'Int64'
  },
  'CustomerName': {
    'description': 'The customer name.',
    'type': 'String'
  },
  'CampaignType': {
    'description': 'The campaign type.',
    'type': 'string'
  },
  'BaseCampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of an experiment campaign.',
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
  'FinalUrlSuffix': {
    'description': 'A place in your final URL where you can add parameters that will be attached to the end of your landing page URL.',
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
  'ViewThroughRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of view-through conversions.',
    'type': 'String'
  },
  'VideoViews': {
    'description': 'The number of times the video was played and watched for at least two continuous seconds with more than 50% of the screen in view.',
    'type': 'Int64'
  },
  'ViewThroughRate': {
    'description': 'The number of video views divided by the number of impressions.',
    'type': 'Double'
  },
  'AverageCPV': {
    'description': 'Average total spend divided by video views.',
    'type': 'Double'
  },
  'VideoViewsAt25Percent': {
    'description': 'The number of times a person completed at least 25% of a video.',
    'type': 'Int64'
  },
  'VideoViewsAt50Percent': {
    'description': 'The number of times a person completed at least 50% of a video.',
    'type': 'Int64'
  },
  'VideoViewsAt75Percent': {
    'description': 'The number of times a person completed at least 75% of a video.',
    'type': 'Int64'
  },
  'CompletedVideoViews': {
    'description': 'Number of times a person watched the entire video to completion.',
    'type': 'Int64'
  },
  'VideoCompletionRate': {
    'description': 'The number of completed video views divided by the total number of impressions, multiplied by 100.',
    'type': 'Int64'
  },
  'TotalWatchTimeInMS': {
    'description': 'Total amount of time a person spent watching the video in milliseconds.',
    'type': 'Date'
  },
  'AverageWatchTimePerVideoView': {
    'description': 'Total watch time divided by the number of video views.',
    'type': 'Int64'
  },
  'AverageWatchTimePerImpression': {
    'description': 'Total watch time, in milliseconds, divided by the number of impressions.',
    'type': 'Double'
  },
  'AdStrength': {
    'description': 'The ad strength score of responsive search ads.',
    'type': 'String'
  },
  'AdStrengthActionItems': {
    'description': 'The suggestion based on ad strength of your responsive search ads.',
    'type': 'String'
  },
  'GoalId': {
    'description': 'The Microsoft Advertising assigned identifier of a conversion goal.',
    'type': 'Int64'
  }
};
