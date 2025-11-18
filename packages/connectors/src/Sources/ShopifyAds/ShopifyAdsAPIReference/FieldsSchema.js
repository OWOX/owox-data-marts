/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var ShopifyAdsFieldsSchema = {
  "marketing-events": {
    "overview": "Marketing Events",
    "description": "Pulls Shopify marketing events that represent paid ads and campaigns.",
    "documentation": "https://shopify.dev/docs/api/admin-rest/2024-10/resources/marketing-event",
    "fields": marketingEventsFields,
    "uniqueKeys": ["id"],
    "destinationName": "shopify_marketing_events"
  },
  "abandoned-checkouts": {
    "overview": "Abandoned Checkouts",
    "description": "Lists checkout sessions that did not convert so you can recover them.",
    "documentation": "https://shopify.dev/docs/api/admin-rest/2024-10/resources/abandoned-checkout",
    "fields": abandonedCheckoutsFields,
    "uniqueKeys": ["token"],
    "destinationName": "shopify_abandoned_checkouts"
  }
};

