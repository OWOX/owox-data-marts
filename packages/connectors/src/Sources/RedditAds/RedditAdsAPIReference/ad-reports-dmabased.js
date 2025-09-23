/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var reportDmaBasedFields = {
  'ad_id': {
    'description': 'The ID of the ad.',
    'type': 'string'
  },
  'date': {
    'description': 'The date for this metric.',
    'type': 'datetime',
    'GoogleBigQueryType': 'date', 
    'GoogleBigQueryPartitioned': true
  },
  'dma': {
    'description': '[ONLY in DMA based report] The Designated Market Area (DMA) targeted for the reports.',
    'type': 'string'
  },
  'clicks': {
    'description': 'The number of clicks detected for this report period.',
    'type': 'integer'
  },
  'conversion_add_to_cart_avg_value': {
    'description': 'Average value of the shopping cart.',
    'type': 'number'
  },
  'conversion_add_to_cart_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_add_to_cart_ecpa': {
    'description': 'The cost per add to cart conversion.',
    'type': 'number'
  },
  'conversion_add_to_cart_total_items': {
    'description': 'Total size of the shopping cart.',
    'type': 'integer'
  },
  'conversion_add_to_cart_total_value': {
    'description': 'Total value of the shopping cart.',
    'type': 'integer'
  },
  'conversion_add_to_cart_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_add_to_wishlist_avg_value': {
    'description': 'Average value of the wish list.',
    'type': 'number'
  },
  'conversion_add_to_wishlist_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_add_to_wishlist_ecpa': {
    'description': 'The cost per add to wishlist conversion.',
    'type': 'number'
  },
  'conversion_add_to_wishlist_total_items': {
    'description': 'Total size of the wish list.',
    'type': 'integer'
  },
  'conversion_add_to_wishlist_total_value': {
    'description': 'Total value of the wish list.',
    'type': 'integer'
  },
  'conversion_add_to_wishlist_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_lead_avg_value': {
    'description': 'Avg value of lead.',
    'type': 'number'
  },
  'conversion_lead_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_lead_ecpa': {
    'description': 'The cost per lead conversion.',
    'type': 'number'
  },
  'conversion_lead_total_value': {
    'description': 'Total value of leads.',
    'type': 'integer'
  },
  'conversion_lead_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_page_visit_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_page_visit_ecpa': {
    'description': 'The cost per page visit conversion.',
    'type': 'number'
  },
  'conversion_page_visit_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_purchase_avg_value': {
    'description': 'Average value of purchase.',
    'type': 'number'
  },
  'conversion_purchase_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_purchase_ecpa': {
    'description': 'The cost per purchase conversion.',
    'type': 'number'
  },
  'conversion_purchase_total_items': {
    'description': 'Total size of the purchase.',
    'type': 'integer'
  },
  'conversion_purchase_total_value': {
    'description': 'Total value of the purchase.',
    'type': 'integer'
  },
  'conversion_purchase_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_roas': {
    'description': 'Return on ad spend for purchases for this period.',
    'type': 'number'
  },
  'conversion_search_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_search_ecpa': {
    'description': 'The cost per search conversion.',
    'type': 'number'
  },
  'conversion_search_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_sign_up_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_sign_up_ecpa': {
    'description': 'The cost per sign up conversion.',
    'type': 'number'
  },
  'conversion_sign_up_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'conversion_signup_avg_value': {
    'description': 'Avg value of signup.',
    'type': 'number'
  },
  'conversion_signup_total_value': {
    'description': 'Total value of signups.',
    'type': 'integer'
  },
  'conversion_view_content_clicks': {
    'description': 'The click through conversions count.',
    'type': 'integer'
  },
  'conversion_view_content_ecpa': {
    'description': 'The cost per view content conversion.',
    'type': 'number'
  },
  'conversion_view_content_views': {
    'description': 'The view through conversions count.',
    'type': 'integer'
  },
  'cpc': {
    'description': 'The cost-per-click for this period.',
    'type': 'number'
  },
  'ctr': {
    'description': 'The click-through-rate for this period.',
    'type': 'number'
  },
  'cpv': {
    'description': '[Broken] The cost-per-view for this period.',
    'type': 'number'
  },
  'ecpm': {
    'description': 'The effective CPM for this period.',
    'type': 'number'
  },
  'engaged_click': {
    'description': 'The number of engaged clicks such as RSVPs.',
    'type': 'integer'
  },
  'hour': {
    'description': 'The hour for this metric in ISO-8601.',
    'type': 'string'
  },
  'impressions': {
    'description': 'The number of impressions served for this report period.',
    'type': 'integer'
  },
  'post_id': {
    'description': 'The unique identifier of the post.',
    'type': 'string'
  },
  'spend': {
    'description': 'The amount (in microcurrency) spent for this report period.',
    'type': 'integer'
  },
  'key_conversion_ecpa': {
    'description': 'Key conversion effective cost per action.',
    'type': 'number'
  },
  'key_conversion_total_count': {
    'description': 'Key conversion total count.',
    'type': 'integer'
  },
  'reach': {
    'description': 'The number of unique users who saw the ad.',
    'type': 'integer'
  },
  'frequency': {
    'description': 'The average number of times each user saw the ad.',
    'type': 'number'
  },
  'currency': {
    'description': 'The currency of the account.',
    'type': 'string'
  }
};
