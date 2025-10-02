/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adAccountCreativesFields = {

  'id': {
  'description': 'Unique ID for an ad creative, numeric string.',
  'type': 'numeric string'
},
'account_id': {
  'description': 'Ad account ID for the account this ad creative belongs to.',
  'type': 'numeric string'
},
'actor_id': {
  'description': 'The actor ID (Page ID or User ID) of this creative',
  'type': 'numeric string'
},
'ad_disclaimer_spec': {
  'description': 'Ad disclaimer data on creative for additional information on ads.',
  'type': 'AdCreativeAdDisclaimer'
},
'adlabels': {
  'description': 'Ad Labels associated with this creative. Used to group it with related ad objects.',
  'type': 'list<AdLabel>'
},
'applink_treatment': {
  'description': 'Used for Dynamic Ads. Specify what action should occur if a person clicks a link in the ad, but the business\' app is not installed on their device. For example, open a webpage displaying the product, or open the app in an app store on the person\'s mobile device.',
  'type': 'enum'
},
'asset_feed_spec': {
  'description': 'Used for Dynamic Creative to automatically experiment and deliver different variations of an ad\'s creative. Specifies an asset feed with multiple images, text and other assets used to generate variations of an ad. Formatted as a JSON string.',
  'type': 'AdAssetFeedSpec'
},
'authorization_category': {
  'description': 'Specifies whether ad was configured to be labeled as a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads.',
  'type': 'enum'
},
'body': {
  'description': 'The body of the ad. Not supported for video post creatives',
  'type': 'string'
},
'branded_content': {
  'description': 'branded_content',
  'type': 'AdCreativeBrandedContentAds'
},
'branded_content_sponsor_page_id': {
  'description': 'ID for page representing business which runs Branded Content ads. See Creating Branded Content Ads.',
  'type': 'numeric string'
},
'bundle_folder_id': {
  'description': 'The Dynamic Ad\'s bundle folder ID',
  'type': 'numeric string'
},
'call_to_action_type': {
  'description': 'Type of call to action button in your ad. This determines the button text and header text for your ad. See Ads Guide for campaign objectives and permitted call to action types.',
  'type': 'enum {OPEN_LINK, LIKE_PAGE, SHOP_NOW, PLAY_GAME, INSTALL_APP, USE_APP, CALL, CALL_ME, VIDEO_CALL, INSTALL_MOBILE_APP, USE_MOBILE_APP, MOBILE_DOWNLOAD, BOOK_TRAVEL, LISTEN_MUSIC, WATCH_VIDEO, LEARN_MORE, SIGN_UP, DOWNLOAD, WATCH_MORE, NO_BUTTON, VISIT_PAGES_FEED, CALL_NOW, APPLY_NOW, CONTACT, BUY_NOW, GET_OFFER, GET_OFFER_VIEW, BUY_TICKETS, UPDATE_APP, GET_DIRECTIONS, BUY, SEND_UPDATES, MESSAGE_PAGE, DONATE, SUBSCRIBE, SAY_THANKS, SELL_NOW, SHARE, DONATE_NOW, GET_QUOTE, CONTACT_US, ORDER_NOW, START_ORDER, ADD_TO_CART, VIDEO_ANNOTATION, RECORD_NOW, INQUIRE_NOW, CONFIRM, REFER_FRIENDS, REQUEST_TIME, GET_SHOWTIMES, LISTEN_NOW, WOODHENGE_SUPPORT, SOTTO_SUBSCRIBE, FOLLOW_USER, RAISE_MONEY, EVENT_RSVP, WHATSAPP_MESSAGE, FOLLOW_NEWS_STORYLINE, SEE_MORE, BOOK_NOW, FIND_A_GROUP, FIND_YOUR_GROUPS, PAY_TO_ACCESS, PURCHASE_GIFT_CARDS, FOLLOW_PAGE, SEND_A_GIFT, SWIPE_UP_SHOP, SWIPE_UP_PRODUCT, SEND_GIFT_MONEY, PLAY_GAME_ON_FACEBOOK, GET_STARTED, OPEN_INSTANT_APP, AUDIO_CALL, GET_PROMOTIONS, JOIN_CHANNEL, MAKE_AN_APPOINTMENT, ASK_ABOUT_SERVICES, BOOK_A_CONSULTATION, GET_A_QUOTE, BUY_VIA_MESSAGE, ASK_FOR_MORE_INFO, CHAT_WITH_US, VIEW_PRODUCT, VIEW_CHANNEL, GET_IN_TOUCH}'
},
'categorization_criteria': {
  'description': 'The Dynamic Category Ad\'s categorization field, e.g. brand',
  'type': 'enum'
},
'category_media_source': {
  'description': 'The Dynamic Ad\'s rendering mode for category ads',
  'type': 'enum'
},
'collaborative_ads_lsb_image_bank_id': {
  'description': 'Used for CPAS local delivery image bank',
  'type': 'numeric string'
},
'contextual_multi_ads': {
  'description': 'contextual_multi_ads',
  'type': 'AdCreativeContextualMultiAds'
},
'creative_sourcing_spec': {
  'description': 'creative_sourcing_spec',
  'type': 'AdCreativeSourcingSpec'
},
'degrees_of_freedom_spec': {
  'description': 'Specifies the types of transformations that are enabled for the given creative',
  'type': 'AdCreativeDegreesOfFreedomSpec'
},
'destination_set_id': {
  'description': 'The ID of the Product Set for a Destination Catalog that will be used to link with Travel Catalogs',
  'type': 'numeric string'
},
'dynamic_ad_voice': {
  'description': 'Used for Store Traffic Objective inside Dynamic Ads. Allows you to control the voice of your ad. If set to DYNAMIC, page name and profile picture in your ad post come from the nearest page location. If set to STORY_OWNER, page name and profile picture in your ad post come from the main page location.',
  'type': 'string'
},
'effective_authorization_category': {
  'description': 'Specifies whether ad is a political ad or not. See Facebook Advertising Policies. This field cannot be used for Dynamic Ads.',
  'type': 'enum'
},
'effective_instagram_media_id': {
  'description': 'The ID of an Instagram post to use in an ad',
  'type': 'numeric string'
},
'effective_object_story_id': {
  'description': 'The ID of a page post to use in an ad, regardless of whether it\'s an organic or unpublished page post',
  'type': 'token with structure: Post ID'
},
'enable_direct_install': {
  'description': 'Whether Direct Install should be enabled on supported devices',
  'type': 'bool'
},
'enable_launch_instant_app': {
  'description': 'Whether Instant App should be enabled on supported devices',
  'type': 'bool'
},
'facebook_branded_content': {
  'description': 'Stores fields for Facebook Branded Content',
  'type': 'AdCreativeFacebookBrandedContent'
},
'image_crops': {
  'description': 'A JSON object defining crop dimensions for the image specified. See image crop reference for more details',
  'type': 'AdsImageCrops'
},
'image_hash': {
  'description': 'Image hash for ad creative. If provided, do not add image_url. See image library for more details.',
  'type': 'string'
},
'image_url': {
  'description': 'A URL for the image for this creative. We save the image at this URL to the ad account\'s image library. If provided, do not include image_hash.',
  'type': 'string'
},
'instagram_permalink_url': {
  'description': 'URL for a post on Instagram you want to run as an ad. Also known as Instagram media.',
  'type': 'string'
},
'instagram_user_id': {
  'description': 'Instagram actor ID',
  'type': 'numeric string'
},
'interactive_components_spec': {
  'description': 'Specification for all the interactive components that would show up on the ad',
  'type': 'AdCreativeInteractiveComponentsSpec'
},
'link_destination_display_url': {
  'description': 'Overwrites the display URL for link ads when object_url is set to a click tag',
  'type': 'string'
},
'link_og_id': {
  'description': 'The Open Graph (OG) ID for the link in this creative if the landing page has OG tags',
  'type': 'numeric string'
},
'link_url': {
  'description': 'Identify a specific landing tab on your Facebook page by the Page tab\'s URL. See connection objects for retrieving Page tab URLs. You can add app_data parameters to the URL to pass data to a Page\'s tab.',
  'type': 'string'
},
'messenger_sponsored_message': {
  'description': 'Used for Messenger sponsored message. JSON string with message for this ad creative. See Messenger Platform, Send API Reference.',
  'type': 'string'
},
'name': {
  'description': 'Name of this ad creative as seen in the ad account\'s library. This field has a limit of 100 characters.',
  'type': 'string'
},
'object_id': {
  'description': 'ID for Facebook object being promoted with ads or relevant to the ad or ad type. For example a page ID if you are running ads to generate Page Likes. See promoted_object.',
  'type': 'numeric string'
},
'object_store_url': {
  'description': 'iTunes or Google Play of the destination of an app ad',
  'type': 'string'
},
'object_story_id': {
  'description': 'ID of a Facebook Page post to use in an ad. You can get this ID by querying the posts of the page. If this post includes an image, it should not exceed 8 MB. Facebook will upload the image from the post to your ad account\'s image library. If you create an unpublished page post via object_story_spec at the same time as creating the ad, this ID will be null. However, the effective_object_story_id will be the ID of the page post regardless of whether it\'s an organic or unpublished page post.',
  'type': 'token with structure: Post ID'
},
'object_story_spec': {
  'description': 'Use if you want to create a new unpublished page post and turn the post into an ad. The Page ID and the content to create a new unpublished page post. Specify link_data, photo_data, video_data, text_data or template_data with the content.',
  'type': 'AdCreativeObjectStorySpec'
},
'object_type': {
  'description': 'The type of Facebook object you want to advertise. Allowed values are:',
  'type': 'enum {APPLICATION, DOMAIN, EVENT, OFFER, PAGE, PHOTO, SHARE, STATUS, STORE_ITEM, VIDEO, INVALID, PRIVACY_CHECK_FAIL, POST_DELETED}'
},
'object_url': {
  'description': 'URL that opens if someone clicks your link on a link ad. This URL is not connected to a Facebook page.',
  'type': 'string'
},
'page_welcome_message': {
  'description': 'Page welcome message for CTM ads',
  'type': 'string'
},
'photo_album_source_object_story_id': {
  'description': 'photo_album_source_object_story_id',
  'type': 'string'
},
'place_page_set_id': {
  'description': 'The ID of the page set for this creative. See theLocal Awareness guide',
  'type': 'numeric string'
},
'platform_customizations': {
  'description': 'Use this field to specify the exact media to use on different Facebook placements. You can currently use this setting for images and videos. Facebook replaces the media originally defined in ad creative with this media when the ad displays in a specific placements. For example, if you define a media here for instagram, Facebook uses that media instead of the media defined in the ad creative when the ad appears on Instagram.',
  'type': 'AdCreativePlatformCustomization'
},
'playable_asset_id': {
  'description': 'The ID of the playable asset in this creative',
  'type': 'numeric string'
},
'portrait_customizations': {
  'description': 'This field describes the rendering customizations selected for portrait mode ads like IG Stories, FB Stories, IGTV, etc',
  'type': 'AdCreativePortraitCustomizations'
},
'product_data': {
  'description': 'product_data',
  'type': 'list<AdCreativeProductData>'
},
'product_set_id': {
  'description': 'Used for Dynamic Ad. An ID for a product set, which groups related products or other items being advertised.',
  'type': 'numeric string'
},
'recommender_settings': {
  'description': 'Used for Dynamic Ads. Settings to display Dynamic ads based on product recommendations.',
  'type': 'AdCreativeRecommenderSettings'
},
'source_instagram_media_id': {
  'description': 'The ID of an Instagram post for creating ads',
  'type': 'numeric string'
},
'status': {
  'description': 'The status of the creative. WITH_ISSUES and IN_PROCESS are available for 4.0 or higher',
  'type': 'enum {ACTIVE, IN_PROCESS, WITH_ISSUES, DELETED}'
},
'template_url': {
  'description': 'Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates.',
  'type': 'string'
},
'template_url_spec': {
  'description': 'Used for Dynamic Ads when you want to use third-party click tracking. See Dynamic Ads, Click Tracking and Templates.',
  'type': 'AdCreativeTemplateURLSpec'
},
'thumbnail_id': {
  'description': 'thumbnail_id',
  'type': 'numeric string'
},
'thumbnail_url': {
  'description': 'URL for a thumbnail image for this ad creative. You can provide dimensions for this with thumbnail_width and thumbnail_height. See example.',
  'type': 'string'
},
'title': {
  'description': 'Title for link ad, which does not belong to a page.',
  'type': 'string'
},
'url_tags': {
  'description': 'A set of query string parameters which will replace or be appended to urls clicked from page post ads, message of the post, and canvas app install creatives only',
  'type': 'string'
},
'use_page_actor_override': {
  'description': 'Used for App Ads. If true, we display the Facebook page associated with the app ads.',
  'type': 'bool'
},
'video_id': {
  'description': '',
  'type': 'numeric string'
}
        
 }