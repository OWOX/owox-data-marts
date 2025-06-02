/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignFields = {
  'Type': {
    'description': 'Row type: Account, Campaign, Ad Group, Keyword, etc.',
    'type': 'string'
  },
  'Status': {
    'description': 'Status of the entity (Active, Paused, Deleted, etc.)',
    'type': 'string'
  },
  'Id': {
    'description': 'Unique ID for the entity (Campaign, Ad Group, etc.)',
    'type': 'string'
  },
  'ParentId': {
    'description': 'Parent entity ID (e.g., Account for Campaign, Campaign for Ad Group)',
    'type': 'string'
  },
  'CampaignId': {
    'description': 'Campaign unique ID',
    'type': 'string'
  },
  'Campaign': {
    'description': 'Campaign name',
    'type': 'string'
  },
  'CampaignType': {
    'description': 'Type of campaign (Search, Shopping, Audience, etc.)',
    'type': 'string'
  },
  'CampaignSubType': {
    'description': 'Sub-type of the campaign',
    'type': 'string'
  },
  'StartDate': {
    'description': 'Start date for the campaign or ad group (YYYY-MM-DD)',
    'type': 'string'
  },
  'EndDate': {
    'description': 'End date for the campaign or ad group (YYYY-MM-DD)',
    'type': 'string'
  },
  'Budget': {
    'description': 'Campaign budget',
    'type': 'float'
  },
  'BudgetType': {
    'description': 'Type of budget (Daily, Monthly, etc.)',
    'type': 'string'
  },
  'BidStrategyName': {
    'description': 'Name of the bid strategy',
    'type': 'string'
  },
  'BidStrategyType': {
    'description': 'Type of bid strategy (Manual CPC, Target CPA, etc.)',
    'type': 'string'
  },
  'Language': {
    'description': 'Language targeting',
    'type': 'string'
  },
  'AdGroup': {
    'description': 'Ad group name',
    'type': 'string'
  },
  'AdGroupType': {
    'description': 'Type of ad group (e.g., Standard, Hotel)',
    'type': 'string'
  },
  'AssetGroup': {
    'description': 'Asset group name (if using Asset Groups/PMax)',
    'type': 'string'
  },
  'AssetGroupId': {
    'description': 'Asset group unique ID',
    'type': 'string'
  },
  'Keyword': {
    'description': 'Keyword text',
    'type': 'string'
  },
  'MatchType': {
    'description': 'Keyword match type (Broad, Phrase, Exact)',
    'type': 'string'
  },
  'Bid': {
    'description': 'Bid amount for the keyword/ad group/campaign',
    'type': 'float'
  },
  'DeviceType': {
    'description': 'Device type (Computer, Mobile, Tablet)',
    'type': 'string'
  },
  'OSNames': {
    'description': 'Device operating systems targeted',
    'type': 'string'
  },
  'CountryCode': {
    'description': 'Country code (e.g., US, GB)',
    'type': 'string'
  },
  'StateOrProvinceCode': {
    'description': 'State or province code',
    'type': 'string'
  },
  'City': {
    'description': 'City name',
    'type': 'string'
  },
  'Clicks': {
    'description': 'Number of clicks received',
    'type': 'float'
  },
  'Impressions': {
    'description': 'Number of times the ad was shown',
    'type': 'float'
  },
  'Spend': {
    'description': 'Total cost or spend',
    'type': 'float',
    'GoogleSheetsFormat': '$#,##0.00'
  },
  'CurrencyCode': {
    'description': 'Currency used for reporting',
    'type': 'string'
  },
  'AvgCPC': {
    'description': 'Average cost per click',
    'type': 'float'
  },
  'AvgCPM': {
    'description': 'Average cost per thousand impressions',
    'type': 'float'
  },
  'CTR': {
    'description': 'Click-through rate',
    'type': 'float'
  },
  'Avgposition': {
    'description': 'Average ad position',
    'type': 'float'
  },
  'QualityScore': {
    'description': 'Quality score (if available)',
    'type': 'float'
  },
  'Conversions': {
    'description': 'Number of conversions',
    'type': 'float'
  },
  'CPA': {
    'description': 'Cost per acquisition/conversion',
    'type': 'float'
  },
  'TrackingTemplate': {
    'description': 'URL tracking template for this entity',
    'type': 'string'
  },
  'FinalUrlSuffix': {
    'description': 'Suffix appended to the final URL for tracking',
    'type': 'string'
  },
  'FinalUrl': {
    'description': 'The actual landing page URL',
    'type': 'string'
  },
  'MobileFinalUrl': {
    'description': 'Mobile-specific landing page URL',
    'type': 'string'
  },
  'DisplayUrl': {
    'description': 'Display URL shown in the ad',
    'type': 'string'
  },
  'Domain': {
    'description': 'Domain of the landing page',
    'type': 'string'
  },
  'Promotion': {
    'description': 'Promotion details (if any)',
    'type': 'string'
  },
  'DevicePreference': {
    'description': 'Device preference setting (All, Mobile only, etc.)',
    'type': 'string'
  },
  'EditorialStatus': {
    'description': 'Editorial status for compliance (e.g., Approved, Disapproved)',
    'type': 'string'
  },
  'EditorialReasonCode': {
    'description': 'Code describing editorial review reason',
    'type': 'string'
  },
  'FeedId': {
    'description': 'Feed ID if used with product ads',
    'type': 'string'
  },
  'SitelinkExtensionLinkText': {
    'description': 'Sitelink extension visible text',
    'type': 'string'
  },
  'BusinessName': {
    'description': 'Name of the business',
    'type': 'string'
  },
  'PhoneNumber': {
    'description': 'Phone number associated with the ad',
    'type': 'string'
  }
};
