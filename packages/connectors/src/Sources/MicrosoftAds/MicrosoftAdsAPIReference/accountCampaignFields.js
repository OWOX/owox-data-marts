/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignFields = {
  'Type': {
    'description': 'Row type: Account, Campaign, Ad Group, Keyword, etc.',
    'type': DATA_TYPES.STRING
  },
  'Status': {
    'description': 'Status of the entity (Active, Paused, Deleted, etc.)',
    'type': DATA_TYPES.STRING
  },
  'Id': {
    'description': 'Unique ID for the entity (Campaign, Ad Group, etc.)',
    'type': DATA_TYPES.STRING
  },
  'ParentId': {
    'description': 'Parent entity ID (e.g., Account for Campaign, Campaign for Ad Group)',
    'type': DATA_TYPES.STRING
  },
  'CampaignId': {
    'description': 'Campaign unique ID',
    'type': DATA_TYPES.STRING
  },
  'Campaign': {
    'description': 'Campaign name',
    'type': DATA_TYPES.STRING
  },
  'CampaignType': {
    'description': 'Type of campaign (Search, Shopping, Audience, etc.)',
    'type': DATA_TYPES.STRING
  },
  'CampaignSubType': {
    'description': 'Sub-type of the campaign',
    'type': DATA_TYPES.STRING
  },
  'StartDate': {
    'description': 'Start date for the campaign or ad group (YYYY-MM-DD)',
    'type': DATA_TYPES.STRING
  },
  'EndDate': {
    'description': 'End date for the campaign or ad group (YYYY-MM-DD)',
    'type': DATA_TYPES.STRING
  },
  'Budget': {
    'description': 'Campaign budget',
    'type': DATA_TYPES.NUMBER
  },
  'BudgetType': {
    'description': 'Type of budget (Daily, Monthly, etc.)',
    'type': DATA_TYPES.STRING
  },
  'BidStrategyName': {
    'description': 'Name of the bid strategy',
    'type': DATA_TYPES.STRING
  },
  'BidStrategyType': {
    'description': 'Type of bid strategy (Manual CPC, Target CPA, etc.)',
    'type': DATA_TYPES.STRING
  },
  'Language': {
    'description': 'Language targeting',
    'type': DATA_TYPES.STRING
  },
  'AdGroup': {
    'description': 'Ad group name',
    'type': DATA_TYPES.STRING
  },
  'AdGroupType': {
    'description': 'Type of ad group (e.g., Standard, Hotel)',
    'type': DATA_TYPES.STRING
  },
  'AssetGroup': {
    'description': 'Asset group name (if using Asset Groups/PMax)',
    'type': DATA_TYPES.STRING
  },
  'AssetGroupId': {
    'description': 'Asset group unique ID',
    'type': DATA_TYPES.STRING
  },
  'Keyword': {
    'description': 'Keyword text',
    'type': DATA_TYPES.STRING
  },
  'MatchType': {
    'description': 'Keyword match type (Broad, Phrase, Exact)',
    'type': DATA_TYPES.STRING
  },
  'Bid': {
    'description': 'Bid amount for the keyword/ad group/campaign',
    'type': DATA_TYPES.NUMBER
  },
  'DeviceType': {
    'description': 'Device type (Computer, Mobile, Tablet)',
    'type': DATA_TYPES.STRING
  },
  'OSNames': {
    'description': 'Device operating systems targeted',
    'type': DATA_TYPES.STRING
  },
  'CountryCode': {
    'description': 'Country code (e.g., US, GB)',
    'type': DATA_TYPES.STRING
  },
  'StateOrProvinceCode': {
    'description': 'State or province code',
    'type': DATA_TYPES.STRING
  },
  'City': {
    'description': 'City name',
    'type': DATA_TYPES.STRING
  },
  'Clicks': {
    'description': 'Number of clicks received',
    'type': DATA_TYPES.NUMBER
  },
  'Impressions': {
    'description': 'Number of times the ad was shown',
    'type': DATA_TYPES.NUMBER
  },
  'Spend': {
    'description': 'Total cost or spend',
    'type': DATA_TYPES.NUMBER,
  },
  'CurrencyCode': {
    'description': 'Currency used for reporting',
    'type': DATA_TYPES.STRING
  },
  'AvgCPC': {
    'description': 'Average cost per click',
    'type': DATA_TYPES.NUMBER
  },
  'AvgCPM': {
    'description': 'Average cost per thousand impressions',
    'type': DATA_TYPES.NUMBER
  },
  'CTR': {
    'description': 'Click-through rate',
    'type': DATA_TYPES.NUMBER
  },
  'Avgposition': {
    'description': 'Average ad position',
    'type': DATA_TYPES.NUMBER
  },
  'QualityScore': {
    'description': 'Quality score (if available)',
    'type': DATA_TYPES.NUMBER
  },
  'Conversions': {
    'description': 'Number of conversions',
    'type': DATA_TYPES.NUMBER
  },
  'CPA': {
    'description': 'Cost per acquisition/conversion',
    'type': DATA_TYPES.NUMBER
  },
  'TrackingTemplate': {
    'description': 'URL tracking template for this entity',
    'type': DATA_TYPES.STRING
  },
  'FinalUrlSuffix': {
    'description': 'Suffix appended to the final URL for tracking',
    'type': DATA_TYPES.STRING
  },
  'FinalUrl': {
    'description': 'The actual landing page URL',
    'type': DATA_TYPES.STRING
  },
  'MobileFinalUrl': {
    'description': 'Mobile-specific landing page URL',
    'type': DATA_TYPES.STRING
  },
  'DisplayUrl': {
    'description': 'Display URL shown in the ad',
    'type': DATA_TYPES.STRING
  },
  'Domain': {
    'description': 'Domain of the landing page',
    'type': DATA_TYPES.STRING
  },
  'Promotion': {
    'description': 'Promotion details (if any)',
    'type': DATA_TYPES.STRING
  },
  'DevicePreference': {
    'description': 'Device preference setting (All, Mobile only, etc.)',
    'type': DATA_TYPES.STRING
  },
  'EditorialStatus': {
    'description': 'Editorial status for compliance (e.g., Approved, Disapproved)',
    'type': DATA_TYPES.STRING
  },
  'EditorialReasonCode': {
    'description': 'Code describing editorial review reason',
    'type': DATA_TYPES.STRING
  },
  'FeedId': {
    'description': 'Feed ID if used with product ads',
    'type': DATA_TYPES.STRING
  },
  'SitelinkExtensionLinkText': {
    'description': 'Sitelink extension visible text',
    'type': DATA_TYPES.STRING
  },
  'BusinessName': {
    'description': 'Name of the business',
    'type': DATA_TYPES.STRING
  },
  'PhoneNumber': {
    'description': 'Phone number associated with the ad',
    'type': DATA_TYPES.STRING
  }
};
