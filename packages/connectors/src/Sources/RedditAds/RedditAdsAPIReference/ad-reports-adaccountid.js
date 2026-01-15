/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var reportAdAccountIdFields = {
  'ad_id': {
    'description': 'The ID of the ad.',
    'type': DATA_TYPES.STRING
  },
  'date': {
    'description': 'The date for this metric.',
    'type': DATA_TYPES.DATE, 
    'GoogleBigQueryPartitioned': true
  },
  'clicks': {
    'description': 'The number of clicks detected for this report period.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_cart_avg_value': {
    'description': 'Average value of the shopping cart.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_add_to_cart_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_cart_ecpa': {
    'description': 'The cost per add to cart conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_add_to_cart_total_items': {
    'description': 'Total size of the shopping cart.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_cart_total_value': {
    'description': 'Total value of the shopping cart.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_cart_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_wishlist_avg_value': {
    'description': 'Average value of the wish list.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_add_to_wishlist_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_wishlist_ecpa': {
    'description': 'The cost per add to wishlist conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_add_to_wishlist_total_items': {
    'description': 'Total size of the wish list.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_wishlist_total_value': {
    'description': 'Total value of the wish list.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_add_to_wishlist_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_lead_avg_value': {
    'description': 'Avg value of lead.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_lead_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_lead_ecpa': {
    'description': 'The cost per lead conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_lead_total_value': {
    'description': 'Total value of leads.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_lead_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_page_visit_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_page_visit_ecpa': {
    'description': 'The cost per page visit conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_page_visit_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_purchase_avg_value': {
    'description': 'Average value of purchase.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_purchase_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_purchase_ecpa': {
    'description': 'The cost per purchase conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_purchase_total_items': {
    'description': 'Total size of the purchase.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_purchase_total_value': {
    'description': 'Total value of the purchase.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_purchase_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_roas': {
    'description': 'Return on ad spend for purchases for this period.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_search_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_search_ecpa': {
    'description': 'The cost per search conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_search_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_sign_up_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_sign_up_ecpa': {
    'description': 'The cost per sign up conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_sign_up_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_signup_avg_value': {
    'description': 'Avg value of signup.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_signup_total_value': {
    'description': 'Total value of signups.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_view_content_clicks': {
    'description': 'The click through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'conversion_view_content_ecpa': {
    'description': 'The cost per view content conversion.',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_view_content_views': {
    'description': 'The view through conversions count.',
    'type': DATA_TYPES.INTEGER
  },
  'cpc': {
    'description': 'The cost-per-click for this period.',
    'type': DATA_TYPES.NUMBER
  },
  'ctr': {
    'description': 'The click-through-rate for this period.',
    'type': DATA_TYPES.NUMBER
  },
  'cpv': {
    'description': '[Broken] The cost-per-view for this period.',
    'type': DATA_TYPES.NUMBER
  },
  'ecpm': {
    'description': 'The effective CPM for this period.',
    'type': DATA_TYPES.NUMBER
  },
  'engaged_click': {
    'description': 'The number of engaged clicks such as RSVPs.',
    'type': DATA_TYPES.INTEGER
  },
  'hour': {
    'description': 'The hour for this metric in ISO-8601.',
    'type': DATA_TYPES.STRING
  },
  'impressions': {
    'description': 'The number of impressions served for this report period.',
    'type': DATA_TYPES.INTEGER
  },
  'post_id': {
    'description': 'The unique identifier of the post.',
    'type': DATA_TYPES.STRING
  },
  'spend': {
    'description': 'The amount (in microcurrency) spent for this report period.',
    'type': DATA_TYPES.INTEGER
  },
  'key_conversion_ecpa': {
    'description': 'Key conversion effective cost per action.',
    'type': DATA_TYPES.NUMBER
  },
  'key_conversion_total_count': {
    'description': 'Key conversion total count.',
    'type': DATA_TYPES.INTEGER
  },
  'reach': {
    'description': 'The number of unique users who saw the ad.',
    'type': DATA_TYPES.INTEGER
  },
  'frequency': {
    'description': 'The average number of times each user saw the ad.',
    'type': DATA_TYPES.NUMBER
  },
  'account_id': {
    'description': '[ONLY in AD_ACCOUNT_ID based report] as account_id The ID of the account.',
    'type': DATA_TYPES.STRING
  },
  'currency': {
    'description': 'The currency of the account.',
    'type': DATA_TYPES.STRING
  }
};
