/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// API reference: https://shopify.dev/docs/api/admin-rest/2024-10/resources/abandoned-checkout

var abandonedCheckoutsFields = {
  'id': {
    'description': 'Checkout numeric identifier.',
    'type': 'numeric string'
  },
  'token': {
    'description': 'Unique token that identifies the checkout.',
    'type': 'string'
  },
  'abandoned_checkout_url': {
    'description': 'Recovery URL for the abandoned checkout.',
    'type': 'string'
  },
  'cart_token': {
    'description': 'Token for the cart associated with this checkout.',
    'type': 'string'
  },
  'completed_at': {
    'description': 'Timestamp when checkout converted into an order.',
    'type': 'datetime'
  },
  'created_at': {
    'description': 'Timestamp when checkout was created.',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'Timestamp of the latest checkout update.',
    'type': 'datetime'
  },
  'currency': {
    'description': 'Currency used on checkout.',
    'type': 'string'
  },
  'presentment_currency': {
    'description': 'Currency presented to the buyer.',
    'type': 'string'
  },
  'email': {
    'description': 'Email address associated with the checkout.',
    'type': 'string'
  },
  'phone': {
    'description': 'Phone number captured during checkout.',
    'type': 'string'
  },
  'order_id': {
    'description': 'Order ID if the checkout completed.',
    'type': 'numeric string'
  },
  'subtotal_price': {
    'description': 'Subtotal price of items before discounts and shipping.',
    'type': 'float'
  },
  'total_price': {
    'description': 'Total checkout price including taxes, discounts, shipping.',
    'type': 'float'
  },
  'total_tax': {
    'description': 'Total amount of tax charged.',
    'type': 'float'
  },
  'total_discounts': {
    'description': 'Total amount discounted at checkout.',
    'type': 'float'
  },
  'total_weight': {
    'description': 'Total weight in grams.',
    'type': 'float'
  },
  'line_items_count': {
    'description': 'Number of line items in the checkout.',
    'type': 'int32'
  },
  'shipping_city': {
    'description': 'City from the shipping address.',
    'type': 'string'
  },
  'shipping_country': {
    'description': 'Country from the shipping address.',
    'type': 'string'
  },
  'shipping_province': {
    'description': 'Province or state from the shipping address.',
    'type': 'string'
  },
  'shipping_postal_code': {
    'description': 'Postal/ZIP code from the shipping address.',
    'type': 'string'
  },
  'customer_id': {
    'description': 'Customer identifier tied to checkout.',
    'type': 'numeric string'
  },
  'customer_first_name': {
    'description': 'Customer first name.',
    'type': 'string'
  },
  'customer_last_name': {
    'description': 'Customer last name.',
    'type': 'string'
  },
  'customer_email': {
    'description': 'Customer email recorded for the checkout.',
    'type': 'string'
  },
  'customer_phone': {
    'description': 'Customer phone recorded for the checkout.',
    'type': 'string'
  }
};

