/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCampaignGroupFields = {
  'id': {
    'description': 'The ID of this ad.',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'The ID of the ad account that this ad belongs to.',
    'type': DATA_TYPES.STRING
  },
  'ad_active_time': {
    'description': 'The time from when the ad was recently active',
    'type': DATA_TYPES.STRING
  },
  'ad_review_feedback': {
    'description': 'The review feedback for this ad after it is reviewed.',
    'type': DATA_TYPES.OBJECT
  },
  'ad_schedule_end_time': {
    'description': 'An optional parameter that defines the end time of an individual ad. If no end time is defined, the ad will run on the campaign’s schedule.',
    'type': DATA_TYPES.DATETIME
  },
  'ad_schedule_start_time': {
    'description': 'An optional parameter that defines the start time of an individual ad. If no start time is defined, the ad will run on the campaign’s schedule.',
    'type': DATA_TYPES.DATETIME
  },
  'adlabels': {
    'description': 'Ad labels associated with this ad',
    'type': DATA_TYPES.ARRAY
  },
  'adset': {
    'description': 'Ad set that contains this ad',
    'type': DATA_TYPES.OBJECT
  },
  'adset_id': {
    'description': 'ID of the ad set that contains the ad',
    'type': DATA_TYPES.STRING
  },
  'bid_amount': {
    'description': 'Bid amount for this ad which will be used in auction. This value would be the same as the bid_amount field on the ad set.',
    'type': DATA_TYPES.INTEGER
  },
  'campaign': {
    'description': 'Ad campaign that contains this ad',
    'type': 'Campaign'
  },
  'campaign_id': {
    'description': 'ID of the ad campaign that contains this ad',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The configured status of the ad. Use status instead of this field.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, ARCHIVED}'
  },
  'conversion_domain': {
    'description': 'The domain where conversions happen. The field is no longer required for creation or update since June 2023. Note that this field should contain only the first and second level domains, and not the full URL. For example facebook.com.',
    'type': DATA_TYPES.STRING
  },
  'created_time': {
    'description': 'Time when the ad was created.',
    'type': DATA_TYPES.DATETIME
  },
  'creative': {
    'description': 'This field is required for create. The ID or creative spec of the ad creative to be used by this ad. You can read more about creatives here. You may supply the ID within an object as follows:',
    'type': DATA_TYPES.OBJECT
  },
  'creative_asset_groups_spec': {
    'description': 'This field is used to create ads using the Flexible ad format. You can read more about that here',
    'type': DATA_TYPES.OBJECT
  },
  'effective_status': {
    'description': 'The effective status of the ad. The status could be effective either because of its own status, or the status of its parent units. WITH_ISSUES is available for version 3.2 or higher. IN_PROCESS is available for version 4.0 or higher',
    'type': DATA_TYPES.STRING
  },
  'issues_info': {
    'description': 'Issues for this ad that prevented it from delivering',
    'type': DATA_TYPES.ARRAY
  },
  'last_updated_by_app_id': {
    'description': 'Indicates the app used for the most recent update of the ad.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'Name of the ad.',
    'type': DATA_TYPES.STRING
  },
  'preview_shareable_link': {
    'description': 'A link that enables users to preview ads in different placements',
    'type': DATA_TYPES.STRING
  },
  'recommendations': {
    'description': 'If there are recommendations for this ad, this field includes them. Otherwise, it is not included in the response. Field not included in redownload mode.',
    'type': DATA_TYPES.ARRAY
  },
  'source_ad': {
    'description': 'The source ad that this ad is copied from',
    'type': DATA_TYPES.OBJECT
  },
  'source_ad_id': {
    'description': 'The source ad id that this ad is copied from',
    'type': DATA_TYPES.STRING
  },
  'status': {
    'description': 'The configured status of the ad. The field returns the same value as configured_status. Use this field, instead of configured_status.',
    'type': DATA_TYPES.STRING
  },
  'tracking_specs': {
    'description': 'With tracking specs, you log actions taken by people on your ad. This field takes arguments identical to action spec. See Tracking and Conversion Specs.',
    'type': DATA_TYPES.ARRAY
  },
  'updated_time': {
    'description': 'Time when this ad was updated.',
    'type': DATA_TYPES.DATETIME
  }
  
}
  