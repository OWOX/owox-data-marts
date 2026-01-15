/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var leadGenFormFields = {
  'ad_account_id': {
    'description': 'The ID of the ad account that the form belongs to.',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'The ID of the form.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The name of the form.',
    'type': DATA_TYPES.STRING
  },
  'privacy_link': {
    'description': 'The URL of the privacy policy for the form.',
    'type': DATA_TYPES.STRING
  },
  'prompt': {
    'description': 'The prompt that is displayed to the user when they are filling out the form.',
    'type': DATA_TYPES.STRING
  },
  'questions': {
    'description': 'A list of questions that are presented to the user to fill out.',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'The time that this entity was created represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  },
  'modified_at': {
    'description': 'The last time that this entity was modified represented in ISO 8601.',
    'type': DATA_TYPES.STRING
  }
};
