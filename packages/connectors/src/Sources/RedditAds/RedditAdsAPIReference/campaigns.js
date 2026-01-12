/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignsFields = {
  'ad_account_id': {
    'description': 'The ID of the ad account.',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The status that the user has configured for this entity. Can differ from the effective status depending on the context such as pending billing information.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'The time that this entity was created, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'effective_status': {
    'description': 'The calculated status determining the real status of this entity.',
    'type': DATA_TYPES.STRING
  },
  'funding_instrument_id': {
    'description': 'Campaign level funding instrument ID.',
    'type': DATA_TYPES.STRING,
  },
  'goal_type': {
    'description': 'The campaign goal type. This cannot be changed after publishing the campaign. Only works for CBO campaigns.',
    'type': DATA_TYPES.STRING
  },
  'goal_value': {
    'description': 'Campaign level goal value in micros. Only works for CBO campaigns.',
    'type': DATA_TYPES.INTEGER
  },
  'id': {
    'description': 'The ID of the campaign.',
    'type': DATA_TYPES.STRING
  },
  'app_id': {
    'description': 'The App ID of the app in the mobile app store (iOS App Store, Google Play Store), and is required for use with App Installs objective campaigns.',
    'type': DATA_TYPES.STRING
  },
  'modified_at': {
    'description': 'The last time that this entity was modified, represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The campaign name. Must be at least 3 characters.',
    'type': DATA_TYPES.STRING
  },
  'objective': {
    'description': 'The objective type of a campaign.',
    'type': DATA_TYPES.STRING
  },
  'special_ad_categories': {
    'description': 'List of special ad categories related to the campaign.',
    'type': DATA_TYPES.STRING
  },
  'spend_cap': {
    'description': 'Campaign lifetime spend cap in microcurrency. Works for both CBO and non-CBO campaigns.',
    'type': DATA_TYPES.INTEGER
  },
  'skadnetwork_metadata': {
    'description': 'Metadata about the SKAdNetwork source ID associated with the campaign.',
    'type': DATA_TYPES.STRING
  }
};
