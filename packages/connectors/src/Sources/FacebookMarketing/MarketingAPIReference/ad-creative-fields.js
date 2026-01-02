/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCreativeFields = {
  'id': {
    'description': 'Unique ID for an ad creative, numeric string.',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'Ad account ID for the account this ad creative belongs to.',
    'type': DATA_TYPES.STRING
  },
  'actor_id': {
    'description': 'The actor ID (Page ID or User ID) of this creative',
    'type': DATA_TYPES.STRING
  },
  'ad_disclaimer_spec': {
    'description': 'Ad disclaimer data on creative for additional information on ads.',
    'type': DATA_TYPES.OBJECT
  },
  'adlabels': {
    'description': 'Ad Labels associated with this creative. Used to group it with related ad objects.',
    'type': DATA_TYPES.ARRAY
  },
  'applink_treatment': {
    'description': 'Used for Dynamic Ads. Specify what action should occur if a person clicks a link in the ad, but the business\' app is not installed on their device. For example, open a webpage displaying the product, or open the app in an app store on the person\'s mobile device.',
    'type': DATA_TYPES.STRING
  },
  'asset_feed_spec': {
    'description': 'Used for Dynamic Creative to automatically experiment and deliver different variations of an ad\'s creative. Specifies an asset feed with multiple images, text and other assets used to generate variations of an ad. Formatted as a JSON string.',
    'type': DATA_TYPES.OBJECT
  },
  'authorization_category': {
    'description': 'Specifies whether ad was configured to be labeled as a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads.',
    'type': DATA_TYPES.STRING
  },
  'body': {
    'description': 'The body of the ad. Not supported for video post creatives',
    'type': DATA_TYPES.STRING
  },
  'branded_content': {
    'description': 'branded_content',
    'type': DATA_TYPES.OBJECT
  },
  'branded_content_sponsor_page_id': {
    'description': 'ID for page representing business which runs Branded Content ads. See Creating Branded Content Ads.',
    'type': DATA_TYPES.STRING
  },
  'bundle_folder_id': {
    'description': 'The Dynamic Ad\'s bundle folder ID',
    'type': DATA_TYPES.STRING
  },
  'call_to_action_type': {
    'description': 'Type of call to action button in your ad. This determines the button text and header text for your ad. See Ads Guide for campaign objectives and permitted call to action types.',
    'type': DATA_TYPES.STRING
  },
  'categorization_criteria': {
    'description': 'The Dynamic Category Ad\'s categorization field, e.g. brand',
    'type': DATA_TYPES.STRING
  },
  'category_media_source': {
    'description': 'The Dynamic Ad\'s rendering mode for category ads',
    'type': DATA_TYPES.STRING
  },
  'collaborative_ads_lsb_image_bank_id': {
    'description': 'Used for CPAS local delivery image bank',
    'type': DATA_TYPES.STRING
  },
  'contextual_multi_ads': {
    'description': 'contextual_multi_ads',
    'type': DATA_TYPES.OBJECT
  },
  'creative_sourcing_spec': {
    'description': 'creative_sourcing_spec',
    'type': DATA_TYPES.OBJECT
  },
  'degrees_of_freedom_spec': {
    'description': 'Specifies the types of transformations that are enabled for the given creative',
    'type': DATA_TYPES.OBJECT
  },
  'destination_set_id': {
    'description': 'The ID of the Product Set for a Destination Catalog that will be used to link with Travel Catalogs',
    'type': DATA_TYPES.STRING
  },
  'dynamic_ad_voice': {
    'description': 'Used for Store Traffic Objective inside Dynamic Ads. Allows you to control the voice of your ad. If set to DYNAMIC, page name and profile picture in your ad post come from the nearest page location. If set to STORY_OWNER, page name and profile picture in your ad post come from the main page location.',
    'type': DATA_TYPES.STRING
  },
  'effective_authorization_category': {
    'description': 'Specifies whether ad is a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads.',
    'type': DATA_TYPES.STRING
  },
  'effective_instagram_media_id': {
    'description': 'The ID of an Instagram post to use in an ad',
    'type': DATA_TYPES.STRING
  },
  'effective_instagram_story_id': {
    'description': 'Used for Instagram Ads. The ID of an Instagram post to display as an Instagram ad.',
    'type': DATA_TYPES.STRING
  },
  'effective_object_story_id': {
    'description': 'The ID of a page post to use in an ad, regardless of whether it\'s an organic or unpublished page post',
    'type': DATA_TYPES.STRING
  },
  'enable_direct_install': {
    'description': 'Whether Direct Install should be enabled on supported devices',
    'type': DATA_TYPES.BOOLEAN
  },
  'enable_launch_instant_app': {
    'description': 'Whether Instant App should be enabled on supported devices',
    'type': DATA_TYPES.BOOLEAN
  },
  'facebook_branded_content': {
    'description': 'Stores fields for Facebook Branded Content',
    'type': DATA_TYPES.OBJECT
  },
  'image_crops': {
    'description': 'A JSON object defining crop dimensions for the image specified. See image crop reference for more details',
    'type': DATA_TYPES.OBJECT
  },
  'image_hash': {
    'description': 'Image hash for ad creative. If provided, do not add image_url. See image library for more details.',
    'type': DATA_TYPES.STRING
  },
  'image_url': {
    'description': 'A URL for the image for this creative. We save the image at this URL to the ad account\'s image library. If provided, do not include image_hash.',
    'type': DATA_TYPES.STRING
  },
  'instagram_actor_id': {
    'description': 'Used for Instagram Ads. Provide Instagram account ID used for running these ads.',
    'type': DATA_TYPES.STRING
  },
  'instagram_permalink_url': {
    'description': 'URL for a post on Instagram you want to run as an ad. Also known as Instagram media.',
    'type': DATA_TYPES.STRING
  },
  'instagram_story_id': {
    'description': 'Used for Instagram Stories as Ads. Specifies the Instagram story you want to run as an ad. This field will be deprecated in the future. Use SOURCE_INSTAGRAM_STORY_ID',
    'type': DATA_TYPES.STRING
  },
  'instagram_user_id': {
    'description': 'Instagram actor ID',
    'type': DATA_TYPES.STRING
  },
  'interactive_components_spec': {
    'description': 'Specification for all the interactive components that would show up on the ad',
    'type': DATA_TYPES.OBJECT
  },
  'link_destination_display_url': {
    'description': 'Overwrites the display URL for link ads when object_url is set to a click tag',
    'type': DATA_TYPES.STRING
  },
  'link_og_id': {
    'description': 'The Open Graph (OG) ID for the link in this creative if the landing page has OG tags',
    'type': DATA_TYPES.STRING
  },
  'link_url': {
    'description': 'Identify a specific landing tab on your Facebook page by the Page tab\'s URL. See connection objects for retrieving Page tab URLs. You can add app_data parameters to the URL to pass data to a Page\'s tab.',
    'type': DATA_TYPES.STRING
  },
  'messenger_sponsored_message': {
    'description': 'Used for Messenger sponsored message. JSON string with message for this ad creative. See Messenger Platform, Send API Reference.',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'Name of this ad creative as seen in the ad account\'s library. This field has a limit of 100 characters.',
    'type': DATA_TYPES.STRING
  },
  'object_id': {
    'description': 'ID for Facebook object being promoted with ads or relevant to the ad or ad type. For example a page ID if you are running ads to generate Page Likes. See promoted_object.',
    'type': DATA_TYPES.STRING
  },
  'object_store_url': {
    'description': 'iTunes or Google Play of the destination of an app ad',
    'type': DATA_TYPES.STRING
  },
  'object_story_id': {
    'description': 'ID of a Facebook Page post to use in an ad. You can get this ID by querying the posts of the page. If this post includes an image, it should not exceed 8 MB. Facebook will upload the image from the post to your ad account\'s image library. If you create an unpublished page post via object_story_spec at the same time as creating the ad, this ID will be null. However, the effective_object_story_id will be the ID of the page post regardless of whether it\'s an organic or unpublished page post.',
    'type': DATA_TYPES.STRING
  },
  'object_story_spec': {
    'description': 'Use if you want to create a new unpublished page post and turn the post into an ad. The Page ID and the content to create a new unpublished page post. Specify link_data, photo_data, video_data, text_data or template_data with the content.',
    'type': DATA_TYPES.OBJECT
  },
  'object_type': {
    'description': 'The type of Facebook object you want to advertise. Allowed values are:',
    'type': DATA_TYPES.STRING
  },
  'object_url': {
    'description': 'URL that opens if someone clicks your link on a link ad. This URL is not connected to a Facebook page.',
    'type': DATA_TYPES.STRING
  },
  'page_welcome_message': {
    'description': 'Page welcome message for CTM ads',
    'type': DATA_TYPES.STRING
  },
  'photo_album_source_object_story_id': {
    'description': 'photo_album_source_object_story_id',
    'type': DATA_TYPES.STRING
  },
  'place_page_set_id': {
    'description': 'The ID of the page set for this creative. See theLocal Awareness guide',
    'type': DATA_TYPES.STRING
  },
  'platform_customizations': {
    'description': 'Use this field to specify the exact media to use on different Facebook placements. You can currently use this setting for images and videos. Facebook replaces the media originally defined in ad creative with this media when the ad displays in a specific placements. For example, if you define a media here for instagram, Facebook uses that media instead of the media defined in the ad creative when the ad appears on Instagram.',
    'type': DATA_TYPES.OBJECT
  },
  'playable_asset_id': {
    'description': 'The ID of the playable asset in this creative',
    'type': DATA_TYPES.STRING
  },
  'portrait_customizations': {
    'description': 'This field describes the rendering customizations selected for portrait mode ads like IG Stories, FB Stories, IGTV, etc',
    'type': DATA_TYPES.OBJECT
  },
  'product_data': {
    'description': 'product_data',
    'type': DATA_TYPES.ARRAY
  },
  'product_set_id': {
    'description': 'Used for Dynamic Ad. An ID for a product set, which groups related products or other items being advertised.',
    'type': DATA_TYPES.STRING
  },
  'recommender_settings': {
    'description': 'Used for Dynamic Ads. Settings to display Dynamic ads based on product recommendations.',
    'type': DATA_TYPES.OBJECT
  },
  'referral_id': {
    'description': 'The ID of Referral Ad Configuration in this creative',
    'type': DATA_TYPES.STRING
  },
  'source_instagram_media_id': {
    'description': 'The ID of an Instagram post for creating ads',
    'type': DATA_TYPES.STRING
  },
  'status': {
    'description': 'The status of the creative. WITH_ISSUES and IN_PROCESS are available for 4.0 or higher',
    'type': DATA_TYPES.STRING
  },
  'template_url': {
    'description': 'Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates.',
    'type': DATA_TYPES.STRING
  },
  'template_url_spec': {
    'description': 'Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates.',
    'type': DATA_TYPES.OBJECT
  },
  'thumbnail_id': {
    'description': 'thumbnail_id',
    'type': DATA_TYPES.STRING
  },
  'thumbnail_url': {
    'description': 'URL for a thumbnail image for this ad creative. You can provide dimensions for this with thumbnail_width and thumbnail_height. See example.',
    'type': DATA_TYPES.STRING
  },
  'title': {
    'description': 'Title for link ad, which does not belong to a page.',
    'type': DATA_TYPES.STRING
  },
  'url_tags': {
    'description': 'A set of query string parameters which will replace or be appended to urls clicked from page post ads, message of the post, and canvas app install creatives only',
    'type': DATA_TYPES.STRING
  },
  'use_page_actor_override': {
    'description': 'Used for App Ads. If true, we display the Facebook page associated with the app ads.',
    'type': DATA_TYPES.BOOLEAN
  },
  'video_id': {
    'description': 'Facebook object ID for video in this ad creative.',
    'type': DATA_TYPES.STRING
  }
  
}
  