/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCampaignFields = {
  'id': {
    'description': 'Unique internal ID representing the campaign',
    'type': DATA_TYPES.STRING
  },
  'account': {
    'description': 'URN identifying the advertising account associated with the campaign. This value is immutable once set. For example, urn:li:sponsoredAccount:{id}',
    'type': DATA_TYPES.STRING
  },
  'accountInfo': {
    'description': 'Information about the advertising account associated with the campaign. This is a read only field. Please refer to Additional Info Fields to learn how to access this field.',
    'type': DATA_TYPES.OBJECT
  },
  'associatedEntity': {
    'description': 'An URN identifying the intended beneficiary of the advertising campaign such as a specific company or member',
    'type': DATA_TYPES.STRING
  },
  'associatedEntityInfo': {
    'description': 'Information about the associatedEntity. If the entity is an organization, an OrganizationInfo object is returned. If the entity is a person, a PersonInfo object is returned. For all other entity types an empty record will be returned. This is a read only field. Please refer to Additional Info Fields to learn how to access this field.',
    'type': DATA_TYPES.OBJECT
  },
  'audienceExpansionEnabled': {
    'description': 'Enable Audience Expansion for the campaign provides query expansion for certain targeting criteria.',
    'type': DATA_TYPES.BOOLEAN
  },
  'campaignGroup': {
    'description': 'URN identifying the campaign group associated with the campaign. The campaign group URN must be specified for campaign creation starting October 30, 2020.',
    'type': DATA_TYPES.STRING
  },
  'campaignGroupInfo': {
    'description': 'Information about the Campaign Group associated with the campaign. This is a read only filed. Please refer to Additional Info Fields to learn how to access this field.',
    'type': DATA_TYPES.OBJECT
  },
  'costType': {
    'description': 'CPM- Cost per thousand advertising impressions. If type=SPONSORED_INMAILS; cost per send(CPS) is measured as CPM x 1000.',
    'type': DATA_TYPES.STRING
  },
  'creativeSelection': {
    'description': 'ROUND_ROBIN - Rotate through available creatives to serve them as evenly as possible.',
    'type': DATA_TYPES.STRING
  },
  'dailyBudget': {
    'description': 'Maximum amount to spend per day UTC. The amount of money as a real number string. ISO currency code. The currency must match that of the parent account.',
    'type': DATA_TYPES.OBJECT
  },
  'locale': {
    'description': 'Locale of the campaign. An uppercase two-letter country code as defined by ISO-3166 and a lowercase two-letter language code as defined by ISO-639. The country and language combination must match one of the supported locales.',
    'type': DATA_TYPES.OBJECT
  },
  'name': {
    'description': 'The name of the campaign; primarily used to make it easier to reference a campaign and to recall its purpose.',
    'type': DATA_TYPES.STRING
  },
  'objectiveType': {
    'description': 'Campaign Objective type values. Click here for Campaign Objective descriptionsBRAND_AWARENESS',
    'type': DATA_TYPES.STRING
  },
  'offsiteDeliveryEnabled': {
    'description': 'Allows your campaign to be served on the LinkedIn Audience Network to extend the reach of the campaign by delivering ads beyond the LinkedIn feed to members on third-party apps and sites. There is no default set.',
    'type': DATA_TYPES.BOOLEAN
  },
  'offsitePreferences': {
    'description': 'Offsite preferences that an advertiser specifies for this campaign. An example OffsitePreference is an object that contains App Categories, App Store URLs, Web Domain Names for which this campaign should be included/excluded. See the OffsitePreferences object for more details and examples.',
    'type': DATA_TYPES.OBJECT
  },
  'runSchedule': {
    'description': 'Scheduled date range to run associated creatives. Object with start (inclusive) and end (exclusive) timestamp fields. The start date must be non-null. The end date is optional and if unset, it indicates an open range.',
    'type': DATA_TYPES.OBJECT
  },
  'targetingCriteria': {
    'description': 'Specifies targeting criteria that the member should match. This is a more advanced boolean expression than the previous targeting field. It provides a generic AND/OR construct to include and exclude different targeting facets when defining audiences for campaigns.',
    'type': DATA_TYPES.OBJECT
  },
  'totalBudget': {
    'description': 'Maximum amount to spend over the life of the campaign. The amount of money as a real number string. ISO currency code. The currency must match that of the account. Deprecated for campaigns not using lifetime pacing.',
    'type': DATA_TYPES.OBJECT
  },
  'type': {
    'description': 'TEXT_AD - Text-based ads that show up in the right column or top of the page on LinkedIn.',
    'type': DATA_TYPES.STRING
  },
  'unitCost': {
    'description': 'Amount to bid per click, impression, or other event depending on the pricing model. The amount of money as a real number string. The amount should be non-negative if the bidding strategy is manual, target cost, or cost cap bidding. The default is 0 with the currency code set to match that of the associated account. ISO currency code.',
    'type': DATA_TYPES.OBJECT
  },
  'status': {
    'description': 'ACTIVE - Denotes that the campaign is fully servable.',
    'type': DATA_TYPES.STRING
  },
  'optimizationTargetType': {
    'description': 'Determines how this campaign is optimized for spending. If this is not set, there is no optimization. Refer to the documentation here.',
    'type': DATA_TYPES.STRING
  },
  'format': {
    'description': 'The ad format on campaign level.',
    'type': DATA_TYPES.STRING
  },
  'pacingStrategy': {
    'description': 'Identifies the pacing option used for the campaign.',
    'type': DATA_TYPES.STRING
  },
  'test': {
    'description': 'Flag showing whether this campaign is a test campaign, i.e., belongs to a test account. This is a read-only and immutable field that is set implicitly during creation based on whether the account is a Test Account or not.',
    'type': DATA_TYPES.BOOLEAN
  },
  'servingStatuses': {
    'description': 'Array of enums that determine whether or not a campaign may be served; unlike \'status\', which is user-managed, the values are controlled by the service. This is a read-only field. Possible values are:RUNNABLE Campaign is eligible for serving.',
    'type': DATA_TYPES.ARRAY
  },
  'connectedTelevisionOnly': {
    'description': 'Flag showing whether this campaign is a Connected Television Only campaign. Allow advertisers to specify when they\'re creating a CTV campaign. Not specifying the boolean can be considered false. When \'connectedTelevisionOnly = true\', offsiteDeliveryEnabled should be set to true. Note: Applicable only from versions 202408 and above.',
    'type': DATA_TYPES.BOOLEAN
  },
  'optimizationPreference': {
    'description': 'Allows granular optimization customization on this campaign on top of optimizationTargetType. FrequencyOptimizationPreference is the first type of optimizationPreference we support now. Note: Applicable only from versions 202408 and above.',
    'type': DATA_TYPES.OBJECT
    }
} 