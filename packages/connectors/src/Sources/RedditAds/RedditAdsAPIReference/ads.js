/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adsFields = {
  'type': {
    'description': 'The type of ad.',
    'type': DATA_TYPES.STRING
  },
  'ad_account_id': {
    'description': 'The ID of the ad account that owns this ad.',
    'type': DATA_TYPES.STRING
  },
  'ad_group_id': {
    'description': 'The ID of the ad group that this ad belongs to.',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'The ID of the campaign that this ad belongs to.',
    'type': DATA_TYPES.STRING
  },
  'campaign_objective_type': {
    'description': 'The objective type of a campaign.',
    'type': DATA_TYPES.STRING
  },
  'click_url': {
    'description': 'The website URL to direct users who click on the ad.',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The status that you have configured for this ad.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'The time that this entity was created, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'effective_status': {
    'description': 'The effective status for the ad.',
    'type': DATA_TYPES.STRING
  },
  'event_trackers': {
    'description': 'URLs to be called on certain events. Only URLs from Reddit’s list of approved measurement providers are allowed.',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'The ID of the ad.',
    'type': DATA_TYPES.STRING
  },
  'modified_at': {
    'description': 'The last time that this entity was modified, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The ad name to be labeled in the dashboard and reports.',
    'type': DATA_TYPES.STRING
  },
  'preview_expiry': {
    'description': 'An expiration time for the preview URL of this ad. This may be set to null to disable the preview URL.',
    'type': DATA_TYPES.STRING
  },
  'preview_url': {
    'description': 'A URL that may be used to preview the ad. This is only available when preview_expiry is set.',
    'type': DATA_TYPES.STRING
  },
  'rejection_reason': {
    'description': 'The reason why the ad was rejected.',
    'type': DATA_TYPES.STRING
  },
  'skadnetwork_metadata': {
    'description': 'Metadata about the SKAdNetwork source ID associated with the ad.',
    'type': DATA_TYPES.STRING
  },
  'post_id': {
    'description': 'The ID of the post that this ad belongs to.',
    'type': DATA_TYPES.STRING
  },
  'post_url': {
    'description': 'The URL of the post that this ad belongs to.',
    'type': DATA_TYPES.STRING
  },
  'products': {
    'description': 'A list of products associated with an ad.',
    'type': DATA_TYPES.STRING
  },
  'profile_id': {
    'description': 'The ID of the ad post’s author. Currently used only for Shopping Ads.',
    'type': DATA_TYPES.STRING
  },
  'profile_username': {
    'description': 'The username of the ad post’s author. Currently used only for Shopping Ads.',
    'type': DATA_TYPES.STRING
  },
  'shopping_creative': {
    'description': 'A collection of attributes used to generate creatives for a particular ad.',
    'type': DATA_TYPES.STRING
  }
};
