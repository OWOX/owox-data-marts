/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupFields = {
  'id': {
    'description': 'The ID of this ad.',
    'type': 'numeric string'
  },
  'account_id': {
    'description': 'The ID of the ad account that this ad belongs to.',
    'type': 'numeric string'
  },
  'ad_active_time': {
    'description': 'The time from when the ad was recently active',
    'type': 'numeric string'
  },
  'ad_review_feedback': {
    'description': 'The review feedback for this ad after it is reviewed.',
    'type': 'AdgroupReviewFeedback'
  },
  'ad_schedule_end_time': {
    'description': 'An optional parameter that defines the end time of an individual ad. If no end time is defined, the ad will run on the campaign’s schedule.',
    'type': 'datetime'
  },
  'ad_schedule_start_time': {
    'description': 'An optional parameter that defines the start time of an individual ad. If no start time is defined, the ad will run on the campaign’s schedule.',
    'type': 'datetime'
  },
  'adlabels': {
    'description': 'Ad labels associated with this ad',
    'type': 'list<AdLabel>'
  },
  'adset': {
    'description': 'Ad set that contains this ad',
    'type': 'AdSet'
  },
  'adset_id': {
    'description': 'ID of the ad set that contains the ad',
    'type': 'numeric string'
  },
  'bid_amount': {
    'description': 'Bid amount for this ad which will be used in auction. This value would be the same as the bid_amount field on the ad set.',
    'type': 'int32'
  },
  'campaign': {
    'description': 'Ad campaign that contains this ad',
    'type': 'Campaign'
  },
  'campaign_id': {
    'description': 'ID of the ad campaign that contains this ad',
    'type': 'numeric string'
  },
  'configured_status': {
    'description': 'The configured status of the ad. Use status instead of this field.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, ARCHIVED}'
  },
  'conversion_domain': {
    'description': 'The domain where conversions happen. The field is no longer required for creation or update since June 2023. Note that this field should contain only the first and second level domains, and not the full URL. For example facebook.com.',
    'type': 'string'
  },
  'created_time': {
    'description': 'Time when the ad was created.',
    'type': 'datetime'
  },
  'creative_id': {
    'description': 'Unique ID for the ad creative',
    'type': 'string',
    'apiName': 'creative.id'
  },
  'creative_effective_object_story_id': {
    'description': 'The ID of a page post to use in an ad, regardless of whether its an organic or unpublished page post',
    'type': 'string',
    'apiName': 'creative.effective_object_story_id'
  },
  'creative_name': {
    'description': 'Name of the ad creative as seen in the ad accounts library',
    'type': 'string',
    'apiName': 'creative.name'
  },
  'creative_object_story_spec': {
    'description': 'Object story spec containing page_id and other details',
    'type': 'string',
    'apiName': 'creative.object_story_spec'
  },
  'creative_url_tags': {
    'description': 'A set of query string parameters which will replace or be appended to urls clicked from page post ads',
    'type': 'string',
    'apiName': 'creative.url_tags'
  },
  'creative_asset_groups_spec': {
    'description': 'This field is used to create ads using the Flexible ad format. You can read more about that here',
    'type': 'AdCreativeAssetGroupsSpec'
  },
  'effective_status': {
    'description': 'The effective status of the ad. The status could be effective either because of its own status, or the status of its parent units. WITH_ISSUES is available for version 3.2 or higher. IN_PROCESS is available for version 4.0 or higher',
    'type': 'enum {ACTIVE, PAUSED, DELETED, PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ARCHIVED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES}'
  },
  'issues_info': {
    'description': 'Issues for this ad that prevented it from delivering',
    'type': 'list<AdgroupIssuesInfo>'
  },
  'last_updated_by_app_id': {
    'description': 'Indicates the app used for the most recent update of the ad.',
    'type': 'id'
  },
  'name': {
    'description': 'Name of the ad.',
    'type': 'string'
  },
  'preview_shareable_link': {
    'description': 'A link that enables users to preview ads in different placements',
    'type': 'string'
  },
  'recommendations': {
    'description': 'If there are recommendations for this ad, this field includes them. Otherwise, it is not included in the response. Field not included in redownload mode.',
    'type': 'list<AdRecommendation>'
  },
  'source_ad': {
    'description': 'The source ad that this ad is copied from',
    'type': 'Ad'
  },
  'source_ad_id': {
    'description': 'The source ad id that this ad is copied from',
    'type': 'numeric string'
  },
  'status': {
    'description': 'The configured status of the ad. The field returns the same value as configured_status. Use this field, instead of configured_status.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, ARCHIVED}'
  },
  'tracking_specs': {
    'description': 'With tracking specs, you log actions taken by people on your ad. This field takes arguments identical to action spec. See Tracking and Conversion Specs.',
    'type': 'list<ConversionActionQuery>'
  },
  'updated_time': {
    'description': 'Time when this ad was updated.',
    'type': 'datetime'
  }
  
}
  