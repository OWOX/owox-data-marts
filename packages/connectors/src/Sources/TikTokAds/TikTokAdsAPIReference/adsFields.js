/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adsFields = {
  'ad_id': {
    'description': 'Ad ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'ad_name': {
    'description': 'Ad Name',
    'type': 'string'
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'type': 'string'
  },
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'adgroup_name': {
    'description': 'Ad Group Name',
    'type': 'string'
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': 'string'
  },
  'secondary_status': {
    'description': 'Secondary Status',
    'type': 'string'
  },
  'create_time': {
    'description': 'Creation Time',
    'type': 'datetime'
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': 'datetime'
  },
  'ad_text': {
    'description': 'Ad Text/Caption',
    'type': 'string'
  },
  'ad_texts': {
    'description': 'Multiple Ad Text Variations',
    'type': 'array'
  },
  'call_to_action': {
    'description': 'Call To Action Text',
    'type': 'string'
  },
  'call_to_action_id': {
    'description': 'Call To Action ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'image_ids': {
    'description': 'Image IDs Used in the Ad',
    'type': 'array'
  },
  'video_id': {
    'description': 'Video ID Used in the Ad',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'image_mode': {
    'description': 'Image Display Mode',
    'type': 'string'
  },
  'creative_type': {
    'description': 'Type of Creative (video, image, etc.)',
    'type': 'string'
  },
  'ad_format': {
    'description': 'Format of the Ad',
    'type': 'string'
  },
  'landing_page_url': {
    'description': 'Landing Page URL',
    'type': 'string'
  },
  'landing_page_urls': {
    'description': 'Multiple Landing Page URLs',
    'type': 'array'
  },
  'deeplink': {
    'description': 'Deep Link URL',
    'type': 'string'
  },
  'deeplink_type': {
    'description': 'Type of Deep Link',
    'type': 'string'
  },
  'tracking_pixel_id': {
    'description': 'Pixel ID for Tracking',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'impression_tracking_url': {
    'description': 'URL for Impression Tracking',
    'type': 'string'
  },
  'click_tracking_url': {
    'description': 'URL for Click Tracking',
    'type': 'string'
  },
  'video_view_tracking_url': {
    'description': 'URL for Video View Tracking',
    'type': 'string'
  },
  'is_new_structure': {
    'description': 'Flag indicating new ad structure',
    'type': 'bool'
  },
  'is_aco': {
    'description': 'Flag indicating Automated Creative Opt.',
    'type': 'bool'
  },
  'optimization_event': {
    'description': 'Event being optimized for',
    'type': 'string'
  },
  'catalog_id': {
    'description': 'Product Catalog ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'product_set_id': {
    'description': 'Product Set ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'sku_ids': {
    'description': 'SKU IDs for Products',
    'type': 'array'
  },
  'domain': {
    'description': 'Domain for the Ad',
    'type': 'string'
  },
  'display_name': {
    'description': 'Display Name shown in the Ad',
    'type': 'string'
  },
  'profile_image_url': {
    'description': 'URL for Profile Image',
    'type': 'string'
  },
  'app_name': {
    'description': 'Name of the App being promoted',
    'type': 'string'
  },
  'tracking_app_id': {
    'description': 'App ID for Tracking',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'identity_id': {
    'description': 'Identity ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'identity_type': {
    'description': 'Type of Identity',
    'type': 'string'
  },
  'page_id': {
    'description': 'TikTok Page ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'tiktok_item_id': {
    'description': 'TikTok Item ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'disclaimer_type': {
    'description': 'Type of Disclaimer',
    'type': 'string'
  },
  'disclaimer_text': {
    'description': 'Disclaimer Text',
    'type': 'string'
  },
  'utm_params': {
    'description': 'UTM Parameters',
    'type': 'object'
  }
};
