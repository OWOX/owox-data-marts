/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountAdsFields = {
  'id': {
    'description': 'The ID of this ad',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'The ID of the ad account that this ad belongs to',
    'type': DATA_TYPES.STRING
  },
  'ad_active_time': {
    'description': 'The time from when the ad was recently active',
    'type': DATA_TYPES.STRING
  },
  'ad_schedule_end_time': {
    'description': 'An optional parameter that defines the end time of an individual ad. If no end time is defined, the ad will run on the campaign\'s schedule',
    'type': DATA_TYPES.DATETIME
  },
  'ad_schedule_start_time': {
    'description': 'An optional parameter that defines the start time of an individual ad. If no start time is defined, the ad will run on the campaign\'s schedule',
    'type': DATA_TYPES.DATETIME
  },
  'adlabels': {
    'description': 'Ad labels associated with this ad',
    'type': DATA_TYPES.ARRAY
  },
  'adset_id': {
    'description': 'ID of the ad set that contains the ad',
    'type': DATA_TYPES.STRING
  },
  'bid_amount': {
    'description': 'Bid amount for this ad which will be used in auction',
    'type': DATA_TYPES.INTEGER
  },
  'campaign_id': {
    'description': 'ID of the ad campaign that contains this ad',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The configured status of the ad. Use status instead of this field',
    'type': DATA_TYPES.STRING
  },
  'conversion_domain': {
    'description': 'The domain where conversions happen',
    'type': DATA_TYPES.STRING
  },
  'created_time': {
    'description': 'Time when the ad was created',
    'type': DATA_TYPES.DATETIME
  },
  'creative_id': {
    'description': 'Unique ID for the ad creative',
    'type': DATA_TYPES.STRING,
    'apiName': 'creative.id'
  },
  'creative_effective_object_story_id': {
    'description': 'The ID of a page post to use in an ad',
    'type': DATA_TYPES.STRING,
    'apiName': 'creative.effective_object_story_id'
  },
  'creative_name': {
    'description': 'Name of the ad creative',
    'type': DATA_TYPES.STRING,
    'apiName': 'creative.name'
  },
  'creative_url_tags': {
    'description': 'Query string parameters appended to urls clicked from page post ads',
    'type': DATA_TYPES.STRING,
    'apiName': 'creative.url_tags'
  },
  'effective_status': {
    'description': 'The effective status of the ad',
    'type': DATA_TYPES.STRING
  },
  'issues_info': {
    'description': 'Issues for this ad that prevented it from delivering',
    'type': DATA_TYPES.ARRAY
  },
  'last_updated_by_app_id': {
    'description': 'Indicates the app used for the most recent update of the ad',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'Name of the ad',
    'type': DATA_TYPES.STRING
  },
  'preview_shareable_link': {
    'description': 'A link that enables users to preview ads in different placements',
    'type': DATA_TYPES.STRING
  },
  'source_ad_id': {
    'description': 'The source ad id that this ad is copied from',
    'type': DATA_TYPES.STRING
  },
  'status': {
    'description': 'The configured status of the ad',
    'type': DATA_TYPES.STRING
  },
  'updated_time': {
    'description': 'Time when this ad was updated',
    'type': DATA_TYPES.DATETIME
  }
}