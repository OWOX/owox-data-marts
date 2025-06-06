/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adPerformanceReportFields = {
  'AbsoluteTopImpressionRatePercent': {
    'description': 'How often your ad was in the first position of all results, as a percentage of your total impressions.',
    'type': 'Double'
  },
  'AccountId': {
    'description': 'The Microsoft Advertising assigned identifier of an account.',
    'type': 'Int64'
  },
  'AccountName': {
    'description': 'The account name.',
    'type': 'String'
  },
  'AccountNumber': {
    'description': 'The Microsoft Advertising assigned number of an account.',
    'type': 'String'
  },
  'AccountStatus': {
    'description': 'The account status.',
    'type': 'String'
  },
  'AdDescription': {
    'description': 'The first ad description that appears below the path in your ad.',
    'type': 'String'
  },
  'AdDescription2': {
    'description': 'The second ad description that appears below the path in your ad. Ad description 2 might not appear in your ad.',
    'type': 'String'
  },
  'AdDistribution': {
    'description': 'The network where you want your ads to show. This can be the entire Microsoft Advertising Network, Microsoft sites and select traffic, or only partner traffic (this network type is deprecated as of July 2024).',
    'type': 'String'
  },
  'AdGroupId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad group.',
    'type': 'Int64'
  },
  'AdGroupName': {
    'description': 'The ad group name.',
    'type': 'String'
  },
  'AdGroupStatus': {
    'description': 'The ad group status.',
    'type': 'String'
  },
  'AdId': {
    'description': 'The Microsoft Advertising assigned identifier of an ad.',
    'type': 'Int64'
  },
  'AdLabels': {
    'description': 'The labels applied to the ad.',
    'type': 'String'
  },
  'AdStatus': {
    'description': 'The ad status.',
    'type': 'String'
  },
  'AdStrength': {
    'description': 'The ad strength score of responsive search ads.',
    'type': 'String'
  },
  'AdStrengthActionItems': {
    'description': 'The suggestion based on ad strength of your responsive search ads.',
    'type': 'String'
  },
  'AdTitle': {
    'description': 'The ad title.',
    'type': 'String'
  },
  'AdType': {
    'description': 'The ad type.',
    'type': 'String'
  },
  'AllConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': 'Double'
  },
  'AllConversions': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'AllConversionsQualified': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'AllCostPerConversion': {
    'description': 'The cost per conversion.',
    'type': 'Double'
  },
  'AllReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': 'Double'
  },
  'AllRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': 'String'
  },
  'AllRevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': 'String'
  },
  'Assists': {
    'description': 'The number of conversions from other ads within the same account that were preceded by one or more clicks from this ad. An ad is considered to have assisted the conversion if it was clicked before the most recently clicked ad that was credited with the conversion. Additionally, the click corresponding to the assist must occur within the conversion period of the goal.',
    'type': 'String'
  },
  'AverageCpc': {
    'description': 'The average cost per click (CPC). The total cost of all clicks on an ad divided by the number of clicks. This is the average amount you\'re actually charged each time your ad is clicked. For example, if you paid a total of 48.35 for 300 clicks, your average CPC is 0.16. The formula for calculating the average CPC is (Spend /Clicks).',
    'type': 'Double'
  },
  'AverageCpm': {
    'description': 'The total advertising cost divided by the number of impressions (in thousands).<br/',
    'type': 'Double'
  },
  'AverageCPV': {
    'description': 'Average total spend divided by video views.',
    'type': 'Double'
  },
  'AveragePosition': {
    'description': 'The average position of the ad on a webpage.',
    'type': 'Double'
  },
  'AverageWatchTimePerImpression': {
    'description': 'Total watch time, in milliseconds, divided by the number of impressions.',
    'type': 'Double'
  },
  'AverageWatchTimePerVideoView': {
    'description': 'Total watch time divided by the number of video views.',
    'type': 'Int64'
  },
  'BaseCampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of an experiment campaign.',
    'type': 'Int64'
  },
  'BidMatchType': {
    'description': 'The keyword bid match type. This can be different from the DeliveredMatchType column, for example if you bid on a broad match and the search term was an exact match. For more information, see Budget and Bid Strategies. The possible values are Broad, Exact, Phrase, and Unknown.',
    'type': 'Int64'
  },
  'BusinessName': {
    'description': 'Depending on your responsive ad\'s placement, your business\'s name may appear in your ad.',
    'type': 'String'
  },
  'CampaignId': {
    'description': 'The Microsoft Advertising assigned identifier of a campaign.',
    'type': 'Int64'
  },
  'CampaignName': {
    'description': 'The campaign name.',
    'type': 'String'
  },
  'CampaignStatus': {
    'description': 'The campaign status.',
    'type': 'String'
  },
  'CampaignType': {
    'description': 'The campaign type.',
    'type': 'String'
  },
  'Clicks': {
    'description': 'Clicks are what you pay for. Clicks typically include a customer clicking an ad on a search results page or on a website on the search network. Clicks can also come from other sources (for example, spiders, robots, and test servers). For more information, see Microsoft Advertising click measurement: description of methodology.',
    'type': 'Int64'
  },
  'CompletedVideoViews': {
    'description': 'Number of times a person watched the entire video to completion.',
    'type': 'Int64'
  },
  'ConversionRate': {
    'description': 'The conversion rate as a percentage.',
    'type': 'Double'
  },
  'Conversions': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'ConversionsQualified': {
    'description': 'The number of conversions.',
    'type': 'Int64'
  },
  'CostPerAssist': {
    'description': 'The cost per assist. The formula for calculating the cost per assist is (Spend / Assists).',
    'type': 'Double'
  },
  'CostPerConversion': {
    'description': 'The cost per conversion.',
    'type': 'Double'
  },
  'Ctr': {
    'description': 'The click-through rate (CTR) is the number of times an ad was clicked, divided by the number of times the ad was shown (impressions). For example, if your ads got 50 clicks given 2,348 impressions, your CTR is 2.13 (%). The formula for calculating CTR is (Clicks / Impressions) x 100.',
    'type': 'Double'
  },
  'CurrencyCode': {
    'description': 'The account currency type. For possible values, see Currencies.',
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
  'CustomParameters': {
    'description': 'The current custom parameters set of the ad, keyword, or criterion.',
    'type': 'String'
  },
  'DeliveredMatchType': {
    'description': 'The match type used to deliver an ad. This can be different from the BidMatchType column, for example if you bid on a broad match and the search term was an exact match. For more information, see Budget and Bid Strategies. The possible values are Broad, Exact, Phrase, and Unknown.',
    'type': 'String'
  },
  'DestinationUrl': {
    'description': 'The destination URL attribute of the ad, keyword, or ad group criterion. If the destination URL contains dynamic text substitution parameters (for example, {param1}), the report will contain the URL after substitution occurs.',
    'type': 'String'
  },
  'DeviceOS': {
    'description': 'The operating system of the device reported in the DeviceType column. The possible values include Android, Blackberry, iOS, Other, Unknown, and Windows. If the operating system of the device cannot be determined or is not one of the operating systems that you can target, the value in this column will be Unknown.',
    'type': 'String'
  },
  'DeviceType': {
    'description': 'The device name attribute of a device OS target bid. The type of device which showed ads. The possible values include Computer, Smartphone, Tablet, and Unknown.',
    'type': 'String'
  },
  'DisplayUrl': {
    'description': 'The ad display URL.',
    'type': 'String'
  },
  'FinalAppUrl': {
    'description': 'Reserved for future use.',
    'type': 'String'
  },
  'FinalMobileUrl': {
    'description': 'The Final Mobile URL of the ad, keyword, or criterion.',
    'type': 'String'
  },
  'FinalUrl': {
    'description': 'The Final URL of the ad, keyword, or criterion.',
    'type': 'String'
  },
  'FinalUrlSuffix': {
    'description': 'A place in your final URL where you can add parameters that will be attached to the end of your landing page URL.',
    'type': 'String'
  },
  'Goal': {
    'description': 'The name of the goal you set for the conversions you want, meaning actions customers take after clicking your ad.',
    'type': 'String'
  },
  'GoalId': {
    'description': 'The Microsoft Advertising assigned identifier of a conversion goal.',
    'type': 'Int64'
  },
  'GoalType': {
    'description': 'The type of conversion goal.',
    'type': 'String'
  },
  'Headline': {
    'description': 'The shorter of two possible responsive ad headlines for Audience campaigns.',
    'type': 'String'
  },
  'Impressions': {
    'description': 'The number of times an ad has been displayed on search results pages. Without impressions there are no clicks or conversions.',
    'type': 'Int64'
  },
  'Language': {
    'description': 'The language of the publisher where the ad was shown.',
    'type': 'String'
  },
  'LongHeadline': {
    'description': 'The longer of two possible responsive ad headlines for Audience campaigns.',
    'type': 'String'
  },
  'Network': {
    'description': 'The entire Microsoft Advertising Network made up of Microsoft sites and select traffic, and only partner traffic (this network type is deprecated as of July 2024). Use this data to make the best decision on network selection for your ad groups. The possible values include AOL search, Audience, Microsoft sites and select traffic, Content, and Syndicated search partners.',
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
  'ReturnOnAdSpend': {
    'description': 'The return on ad spend (ROAS).',
    'type': 'Double'
  },
  'Revenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of conversions.',
    'type': 'String'
  },
  'RevenuePerAssist': {
    'description': 'The revenue per assist. The formula for calculating the revenue per assist is (Revenue / Assists).',
    'type': 'String'
  },
  'RevenuePerConversion': {
    'description': 'The revenue per conversion.',
    'type': 'String'
  },
  'Spend': {
    'description': 'The cost per click (CPC) summed for each click.',
    'type': 'Double',
    'GoogleSheetsFormat': '$#,##0.00'
  },
  'TimePeriod': {
    'description': 'The time period of each report row. You may not include this column if the Aggregation element of the request object is set to Summary. For more information, see Time Period Column.',
    'type': 'Date',
    'GoogleSheetsFormat': '@'
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
  'TopImpressionRatePercent': {
    'description': 'The percentage of times your ad showed in the mainline, the top placement where ads appear above the search results, out of your total impressions.',
    'type': 'Double'
  },
  'TopVsOther': {
    'description': 'Indicates whether the ad impression appeared in a top position or elsewhere. The possible values include AOL search - Top, AOL search - Other, Audience network, Bing and Yahoo! search - Top, Bing and Yahoo! search - Other, Syndicated search partners - Top, Syndicated search partners - Other, Content network, and Unknown.',
    'type': 'String'
  },
  'TotalWatchTimeInMS': {
    'description': 'Total amount of time a person spent watching the video in milliseconds.',
    'type': 'Date'
  },
  'TrackingTemplate': {
    'description': 'The current tracking template of the ad, keyword, or criterion.',
    'type': 'String'
  },
  'VideoCompletionRate': {
    'description': 'The number of completed video views divided by the total number of impressions, multiplied by 100.',
    'type': 'Int64'
  },
  'VideoViews': {
    'description': 'The number of times the video was played and watched for at least two continuous seconds with more than 50% of the screen in view.',
    'type': 'Int64'
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
  'ViewThroughConversions': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': 'Int64'
  },
  'ViewThroughConversionsQualified': {
    'description': 'View-through conversions are conversions that people make after they have seen your ad, even though they did not click the ad.',
    'type': 'Int64'
  },
  'ViewThroughRate': {
    'description': 'The number of video views divided by the number of impressions.',
    'type': 'Double'
  },
  'ViewThroughRevenue': {
    'description': 'The revenue optionally reported by the advertiser as a result of view-through conversions.',
    'type': 'String'
  }
};
