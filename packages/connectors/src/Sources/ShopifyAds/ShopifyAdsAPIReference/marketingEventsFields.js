/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-rest/2024-10/resources/marketing-event

var marketingEventsFields = {
  'id': {
    'description': 'Unique identifier of the marketing event.',
    'type': 'numeric string'
  },
  'name': {
    'description': 'Optional name that represents the marketing effort.',
    'type': 'string'
  },
  'event_type': {
    'description': 'Event category such as ad, post, flash_sale, etc.',
    'type': 'string'
  },
  'marketing_channel': {
    'description': 'Primary marketing channel (search, email, social, display).',
    'type': 'string'
  },
  'marketing_activity_type': {
    'description': 'Specific tactic that ran within a channel (ad, post, campaign).',
    'type': 'string'
  },
  'paid': {
    'description': 'Indicates whether the event required ad spend.',
    'type': 'bool'
  },
  'budget': {
    'description': 'Budget allocated to the marketing event.',
    'type': 'float'
  },
  'budget_type': {
    'description': 'Type of budget (daily, lifetime).',
    'type': 'string'
  },
  'budget_currency': {
    'description': 'Currency code for the budget amount.',
    'type': 'string'
  },
  'currency_code': {
    'description': 'Currency used for spend reporting.',
    'type': 'string'
  },
  'started_at': {
    'description': 'ISO 8601 timestamp when the marketing event started.',
    'type': 'datetime'
  },
  'ended_at': {
    'description': 'ISO 8601 timestamp when the marketing event ended.',
    'type': 'datetime'
  },
  'preview_url': {
    'description': 'Preview URL for the asset that ran as part of the marketing event.',
    'type': 'string'
  },
  'remote_id': {
    'description': 'Identifier assigned by the external ads platform.',
    'type': 'string'
  },
  'utm_campaign': {
    'description': 'UTM campaign parameter that was attached to the event.',
    'type': 'string'
  },
  'utm_source': {
    'description': 'UTM source parameter that identifies the source network.',
    'type': 'string'
  },
  'utm_medium': {
    'description': 'UTM medium parameter that identifies the medium (cpc, email).',
    'type': 'string'
  },
  'utm_term': {
    'description': 'UTM term parameter for keywords.',
    'type': 'string'
  },
  'utm_content': {
    'description': 'UTM content parameter for creative variants.',
    'type': 'string'
  },
  'created_at': {
    'description': 'Timestamp when the marketing event was created in Shopify.',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'Timestamp when the marketing event was last updated in Shopify.',
    'type': 'datetime'
  }
};

