/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adsFields = {
  'ad_id': {
    'description': 'Ad ID',
    'type': DATA_TYPES.STRING,
  },
  'ad_name': {
    'description': 'Ad Name',
    'type': DATA_TYPES.STRING
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': DATA_TYPES.STRING,
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'type': DATA_TYPES.STRING,
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'type': DATA_TYPES.STRING
  },
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': DATA_TYPES.STRING,
  },
  'adgroup_name': {
    'description': 'Ad Group Name',
    'type': DATA_TYPES.STRING
  },
  'operation_status': {
    'description': 'Operation Status',
    'type': DATA_TYPES.STRING
  },
  'secondary_status': {
    'description': 'Secondary Status',
    'type': DATA_TYPES.STRING
  },
  'create_time': {
    'description': 'Creation Time',
    'type': DATA_TYPES.DATETIME
  },
  'modify_time': {
    'description': 'Last Modified Time',
    'type': DATA_TYPES.DATETIME
  },
  'ad_text': {
    'description': 'Ad Text/Caption',
    'type': DATA_TYPES.STRING
  },
  'ad_texts': {
    'description': 'Multiple Ad Text Variations',
    'type': DATA_TYPES.ARRAY
  },
  'call_to_action': {
    'description': 'Call To Action Text',
    'type': DATA_TYPES.STRING
  },
  'call_to_action_id': {
    'description': 'Call To Action ID',
    'type': DATA_TYPES.STRING,
  },
  'image_ids': {
    'description': 'Image IDs Used in the Ad',
    'type': DATA_TYPES.ARRAY
  },
  'video_id': {
    'description': 'Video ID Used in the Ad',
    'type': DATA_TYPES.STRING,
  },
  'image_mode': {
    'description': 'Image Display Mode',
    'type': DATA_TYPES.STRING
  },
  'creative_type': {
    'description': 'Type of Creative (video, image, etc.)',
    'type': DATA_TYPES.STRING
  },
  'ad_format': {
    'description': 'Format of the Ad',
    'type': DATA_TYPES.STRING
  },
  'landing_page_url': {
    'description': 'Landing Page URL',
    'type': DATA_TYPES.STRING
  },
  'landing_page_urls': {
    'description': 'Multiple Landing Page URLs',
    'type': DATA_TYPES.ARRAY
  },
  'deeplink': {
    'description': 'Deep Link URL',
    'type': DATA_TYPES.STRING
  },
  'deeplink_type': {
    'description': 'Type of Deep Link',
    'type': DATA_TYPES.STRING
  },
  'tracking_pixel_id': {
    'description': 'Pixel ID for Tracking',
    'type': DATA_TYPES.STRING,
  },
  'impression_tracking_url': {
    'description': 'URL for Impression Tracking',
    'type': DATA_TYPES.STRING
  },
  'click_tracking_url': {
    'description': 'URL for Click Tracking',
    'type': DATA_TYPES.STRING
  },
  'video_view_tracking_url': {
    'description': 'URL for Video View Tracking',
    'type': DATA_TYPES.STRING
  },
  'is_new_structure': {
    'description': 'Flag indicating new ad structure',
    'type': DATA_TYPES.BOOLEAN
  },
  'is_aco': {
    'description': 'Flag indicating Automated Creative Opt.',
    'type': DATA_TYPES.BOOLEAN
  },
  'optimization_event': {
    'description': 'Event being optimized for',
    'type': DATA_TYPES.STRING
  },
  'catalog_id': {
    'description': 'Product Catalog ID',
    'type': DATA_TYPES.STRING,
  },
  'product_set_id': {
    'description': 'Product Set ID',
    'type': DATA_TYPES.STRING,
  },
  'sku_ids': {
    'description': 'SKU IDs for Products',
    'type': DATA_TYPES.ARRAY
  },
  'domain': {
    'description': 'Domain for the Ad',
    'type': DATA_TYPES.STRING
  },
  'display_name': {
    'description': 'Display Name shown in the Ad',
    'type': DATA_TYPES.STRING
  },
  'profile_image_url': {
    'description': 'URL for Profile Image',
    'type': DATA_TYPES.STRING
  },
  'app_name': {
    'description': 'Name of the App being promoted',
    'type': DATA_TYPES.STRING
  },
  'tracking_app_id': {
    'description': 'App ID for Tracking',
    'type': DATA_TYPES.STRING,  
  },
  'identity_id': {
    'description': 'Identity ID',
    'type': DATA_TYPES.STRING,
  },
  'identity_type': {
    'description': 'Type of Identity',
    'type': DATA_TYPES.STRING
  },
  'page_id': {
    'description': 'TikTok Page ID',
    'type': DATA_TYPES.STRING,
  },
  'tiktok_item_id': {
    'description': 'TikTok Item ID',
    'type': DATA_TYPES.STRING,
  },
  'disclaimer_type': {
    'description': 'Type of Disclaimer',
    'type': DATA_TYPES.STRING
  },
  'disclaimer_text': {
    'description': 'Disclaimer Text',
    'type': DATA_TYPES.STRING
  },
  'utm_params': {
    'description': 'UTM Parameters',
    'type': DATA_TYPES.OBJECT
  }
};
