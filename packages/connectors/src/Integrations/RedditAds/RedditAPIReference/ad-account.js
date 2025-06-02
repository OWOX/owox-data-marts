/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountFields = {
    'admin_approval': {
      'description': 'Describes an employee set state for the account.',
      'type': 'string'
    },
    'attribution_type': {
      'description': 'The attribution type. Only valid for CPA bid types.',
      'type': 'string'
    },
    'business_id': {
      'description': 'The ID of the business that this account belongs to.',
      'type': 'string'
    },
    'click_attribution_window': {
      'description': 'Configures the window to use when querying reporting for click attributions.',
      'type': 'string'
    },
    'created_at': {
      'description': 'The time that this entity was created, represented in ISO 8601.',
      'type': 'string'
    },
    'currency': {
      'description': 'The ISO4217 currency symbol for the currency used.',
      'type': 'string'
    },
    'id': {
      'description': 'The ID of the ad account.',
      'type': 'string'
    },
    'modified_at': {
      'description': 'The last time that this entity was modified, represented in ISO 8601.',
      'type': 'string'
    },
    'name': {
      'description': 'The ad account name.',
      'type': 'string'
    },
    'pixel_partner_preferences': {
      'description': 'A list of pixel partners allowed by the advertiser.',
      'type': 'string'
    },
    'primary_contact_member_id': {
      'description': 'The ID of the primary contact member.',
      'type': 'string'
    },
    'suspension_reason': {
      'description': 'The reason why this ad account was suspended.',
      'type': 'string'
    },
    'time_zone_id': {
      'description': 'The default time zone setting for this entity.',
      'type': 'string'
    },
    'type': {
      'description': 'The type of the ad account.',
      'type': 'string'
    },
    'view_attribution_window': {
      'description': 'Configures the window to use when querying reporting for view attributions.',
      'type': 'string'
    },
    'excluded_communities': {
      'description': 'Account level excluded communities.',
      'type': 'string'
    },
    'excluded_keywords': {
      'description': 'Account level excluded keywords.',
      'type': 'string'
    }
};