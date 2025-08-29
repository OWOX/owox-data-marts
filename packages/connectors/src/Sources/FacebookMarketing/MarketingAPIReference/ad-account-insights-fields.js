/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars */
var adAccountInsightsFields = {
  'account_currency': {
    'description': 'Currency that is used by your ad account.',
    'type': 'string'
  },
  'account_id': {
    'description': 'The ID number of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing.',
    'type': 'numeric string',
    'GoogleSheetsFormat': '@'
  },
  'account_name': {
    'description': 'The name of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing.',
    'type': 'string'
  },
  'action_values': {
    'description': 'The total value of all conversions attributed to your ads.',
    'type': 'list<AdsActionStats>'
  },
  'actions': {
    'description': 'The total number of actions people took that are attributed to your ads. Actions may include engagement, clicks or conversions.',
    'type': 'list<AdsActionStats>'
  },
  'ad_click_actions': {
    'description': 'ad_click_actions',
    'type': 'list<AdsActionStats>'
  },
  'ad_format_asset': {
    'description': 'ad_format_asset',
    'type': 'string'
  },
  'ad_id': {
    'description': 'The unique ID of the ad you\'re viewing in reporting.',
    'type': 'numeric string',
    'GoogleSheetsFormat': '@'
  },
  'ad_impression_actions': {
    'description': 'ad_impression_actions',
    'type': 'list<AdsActionStats>'
  },
  'ad_name': {
    'description': 'The name of the ad you\'re viewing in reporting.',
    'type': 'string'
  },
  'adset_id': {
    'description': 'The unique ID of the ad set you\'re viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting.',
    'type': 'numeric string',
    'GoogleSheetsFormat': '@'
  },
  'adset_name': {
    'description': 'The name of the ad set you\'re viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting.',
    'type': 'string'
  },
  'attribution_setting': {
    'description': 'The default attribution window to be used when attribution result is calculated. Each ad set has its own attribution setting value. The attribution setting for campaign or account is calculated based on existing ad sets.',
    'type': 'string'
  },
  'auction_bid': {
    'description': 'auction_bid',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'auction_competitiveness': {
    'description': 'auction_competitiveness',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'auction_max_competitor_bid': {
    'description': 'auction_max_competitor_bid',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'body_asset': {
    'description': 'body_asset',
    'type': 'AdAssetBody'
  },
  'buying_type': {
    'description': 'The method by which you pay for and target ads in your campaigns: through dynamic auction bidding, fixed-price bidding, or reach and frequency buying. This field is currently only visible at the campaign level.',
    'type': 'string'
  },
  'campaign_id': {
    'description': 'The unique ID number of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': 'numeric string',
    'GoogleSheetsFormat': '@'
  },
  'campaign_name': {
    'description': 'The name of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': 'string'
  },
  'canvas_avg_view_percent': {
    'description': 'The average percentage of the Instant Experience that people saw. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'canvas_avg_view_time': {
    'description': 'The average total time, in seconds, that people spent viewing an Instant Experience. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'catalog_segment_actions': {
    'description': 'The number of actions performed attributed to your ads promoting your catalog segment, broken down by action type.',
    'type': 'list<AdsActionStats>'
  },
  'catalog_segment_value': {
    'description': 'The total value of all conversions from your catalog segment attributed to your ads.',
    'type': 'list<AdsActionStats>'
  },
  'catalog_segment_value_mobile_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from mobile app purchases for your catalog segment.',
    'type': 'list<AdsActionStats>'
  },
  'catalog_segment_value_omni_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from all purchases for your catalog segment.',
    'type': 'list<AdsActionStats>'
  },
  'catalog_segment_value_website_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from website purchases for your catalog segment.',
    'type': 'list<AdsActionStats>'
  },
  'clicks': {
    'description': 'The number of clicks on your ads.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'conversion_values': {
    'description': 'conversion_values',
    'type': 'list<AdsActionStats>'
  },
  'conversions': {
    'description': 'conversions',
    'type': 'list<AdsActionStats>'
  },
  'converted_product_quantity': {
    'description': 'The number of products purchased which are recorded by your merchant partner\'s pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown.',
    'type': 'list<AdsActionStats>'
  },
  'converted_product_value': {
    'description': 'The value of purchases recorded by your merchant partner\'s pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown.',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_15_sec_video_view': {
    'description': 'cost_per_15_sec_video_view',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_2_sec_continuous_video_view': {
    'description': 'cost_per_2_sec_continuous_video_view',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_action_type': {
    'description': 'The average cost of a relevant action.',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_ad_click': {
    'description': 'cost_per_ad_click',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_conversion': {
    'description': 'cost_per_conversion',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_dda_countby_convs': {
    'description': 'cost_per_dda_countby_convs',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cost_per_inline_link_click': {
    'description': 'The average cost of each inline link click.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cost_per_inline_post_engagement': {
    'description': 'The average cost of each inline post engagement.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cost_per_one_thousand_ad_impression': {
    'description': 'cost_per_one_thousand_ad_impression',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_outbound_click': {
    'description': 'The average cost for each outbound click.',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_thruplay': {
    'description': 'The average cost for each ThruPlay. This metric is in development.',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_unique_action_type': {
    'description': 'The average cost of each unique action. This metric is estimated.',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_unique_click': {
    'description': 'The average cost for each unique click (all). This metric is estimated.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cost_per_unique_conversion': {
    'description': 'cost_per_unique_conversion',
    'type': 'list<AdsActionStats>'
  },
  'cost_per_unique_inline_link_click': {
    'description': 'The average cost of each unique inline link click. This metric is estimated.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cost_per_unique_outbound_click': {
    'description': 'The average cost for each unique outbound click. This metric is estimated.',
    'type': 'list<AdsActionStats>'
  },
  'cpc': {
    'description': 'The average cost for each click (all).',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cpm': {
    'description': 'The average cost for 1,000 impressions.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'cpp': {
    'description': 'The average cost to reach 1,000 people. This metric is estimated.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'created_time': {
    'description': 'created_time',
    'type': 'string'
  },
  'ctr': {
    'description': 'The percentage of times people saw your ad and performed a click (all).',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'date_start': {
    'description': 'The start date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': 'string',
    'GoogleBigQueryType': 'date',
    'GoogleBigQueryPartitioned': true
  },
  'date_stop': {
    'description': 'The end date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': 'string',
    'GoogleBigQueryType': 'date'
  },
  'dda_countby_convs': {
    'description': 'dda_countby_convs',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'dda_results': {
    'description': 'dda_results',
    'type': 'list<AdsInsightsDdaResult>'
  },
  'description_asset': {
    'description': 'description_asset',
    'type': 'AdAssetDescription'
  },
  'frequency': {
    'description': 'The average number of times each person saw your ad. This metric is estimated.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'full_view_impressions': {
    'description': 'The number of Full Views on your Page\'s posts as a result of your ad.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'full_view_reach': {
    'description': 'The number of people who performed a Full View on your Page\'s post as a result of your ad.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'image_asset': {
    'description': 'image_asset',
    'type': 'AdAssetImage'
  },
  'impressions': {
    'description': 'The number of times your ads were on screen.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'inline_link_click_ctr': {
    'description': 'The percentage of time people saw your ads and performed an inline link click.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'inline_link_clicks': {
    'description': 'The number of clicks on links to select destinations or experiences, on or off Facebook-owned properties. Inline link clicks use a fixed 1-day-click attribution window.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'inline_post_engagement': {
    'description': 'The total number of actions that people take involving your ads. Inline post engagements use a fixed 1-day-click attribution window.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'instagram_upcoming_event_reminders_set': {
    'description': 'instagram_upcoming_event_reminders_set',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'instant_experience_clicks_to_open': {
    'description': 'instant_experience_clicks_to_open',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'instant_experience_clicks_to_start': {
    'description': 'instant_experience_clicks_to_start',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'instant_experience_outbound_clicks': {
    'description': 'instant_experience_outbound_clicks',
    'type': 'list<AdsActionStats>'
  },
  'interactive_component_tap': {
    'description': 'interactive_component_tap',
    'type': 'list<AdsActionStats>'
  },
  'marketing_messages_delivery_rate': {
    'description': 'The number of messages delivered divided by the number of messages sent. Some messages may not be delivered, such as when a customer\'s device is out of service. This metric doesn\'t include messages sent to Europe and Japan.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'mobile_app_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from mobile app purchases. This is based on the value that you assigned when you set up the app event.',
    'type': 'list<AdsActionStats>'
  },
  'objective': {
    'description': 'The objective reflecting the goal you want to achieve with your advertising. It may be different from the selected objective of the campaign in some cases.',
    'type': 'string'
  },
  'optimization_goal': {
    'description': 'The optimization goal you selected for your ad or ad set. Your optimization goal reflects what you want to optimize for the ads.',
    'type': 'string'
  },
  'outbound_clicks': {
    'description': 'The number of clicks on links that take people off Facebook-owned properties.',
    'type': 'list<AdsActionStats>'
  },
  'outbound_clicks_ctr': {
    'description': 'The percentage of times people saw your ad and performed an outbound click.',
    'type': 'list<AdsActionStats>'
  },
  'purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from purchases. This is based on information received from one or more of your connected Facebook Business Tools and attributed to your ads.',
    'type': 'list<AdsActionStats>'
  },
  'qualifying_question_qualify_answer_rate': {
    'description': 'qualifying_question_qualify_answer_rate',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'reach': {
    'description': 'The number of people who saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same people. This metric is estimated.',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'shops_assisted_purchases': {
    'description': 'shops_assisted_purchases',
    'type': 'string'
  },
  'social_spend': {
    'description': 'The total amount you\'ve spent so far for your ads showed with social information. (ex: Jane Doe likes this).',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'spend': {
    'description': 'The estimated total amount of money you\'ve spent on your campaign, ad set or ad during its schedule. This metric is estimated.',
    'type': 'numeric string',
    'GoogleSheetsFormat': '$#,##0.00',
    'GoogleBigQueryType': 'numeric'
  },
  'title_asset': {
    'description': 'title_asset',
    'type': 'AdAssetTitle'
  },
  'updated_time': {
    'description': 'updated_time',
    'type': 'string'
  },
  'user_segment_key': {
    'description': 'user_segment_key',
    'type': 'string'
  },
  'video_30_sec_watched_actions': {
    'description': 'The number of times your video played for at least 30 seconds, or for nearly its total length if it\'s shorter than 30 seconds. For each impression of a video, we\'ll count video views separately and exclude any time spent replaying the video.',
    'type': 'list<AdsActionStats>'
  },
  'video_asset': {
    'description': 'video_asset',
    'type': 'AdAssetVideo'
  },
  'video_avg_time_watched_actions': {
    'description': 'The average time a video was played, including any time spent replaying the video for a single impression.',
    'type': 'list<AdsActionStats>'
  },
  'video_continuous_2_sec_watched_actions': {
    'description': 'video_continuous_2_sec_watched_actions',
    'type': 'list<AdsActionStats>'
  },
  'video_p100_watched_actions': {
    'description': 'The number of times your video was played at 100% of its length, including plays that skipped to this point.',
    'type': 'list<AdsActionStats>'
  },
  'video_p25_watched_actions': {
    'description': 'The number of times your video was played at 25% of its length, including plays that skipped to this point.',
    'type': 'list<AdsActionStats>'
  },
  'video_p50_watched_actions': {
    'description': 'The number of times your video was played at 50% of its length, including plays that skipped to this point.',
    'type': 'list<AdsActionStats>'
  },
  'video_p75_watched_actions': {
    'description': 'The number of times your video was played at 75% of its length, including plays that skipped to this point.',
    'type': 'list<AdsActionStats>'
  },
  'video_p95_watched_actions': {
    'description': 'The number of times your video was played at 95% of its length, including plays that skipped to this point.',
    'type': 'list<AdsActionStats>'
  },
  'video_play_actions': {
    'description': 'The number of times your video starts to play. This is counted for each impression of a video, and excludes replays. This metric is in development.',
    'type': 'list<AdsActionStats>'
  },
  'video_play_curve_actions': {
    'description': 'A video-play based curve graph that illustrates the percentage of video plays that reached a given second. Entries 0 to 14 represent seconds 0 thru 14. Entries 15 to 17 represent second ranges [15 to 20), [20 to 25), and [25 to 30). Entries 18 to 20 represent second ranges [30 to 40), [40 to 50), and [50 to 60). Entry 21 represents plays over 60 seconds.',
    'type': 'list<AdsHistogramStats>'
  },
  'video_play_retention_0_to_15s_actions': {
    'description': 'video_play_retention_0_to_15s_actions',
    'type': 'list<AdsHistogramStats>'
  },
  'video_play_retention_20_to_60s_actions': {
    'description': 'video_play_retention_20_to_60s_actions',
    'type': 'list<AdsHistogramStats>'
  },
  'video_play_retention_graph_actions': {
    'description': 'video_play_retention_graph_actions',
    'type': 'list<AdsHistogramStats>'
  },
  'video_time_watched_actions': {
    'description': 'video_time_watched_actions',
    'type': 'list<AdsActionStats>'
  },
  'website_ctr': {
    'description': 'The percentage of times people saw your ad and performed a link click.',
    'type': 'list<AdsActionStats>'
  },
  'website_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from website purchases. This is based on the value of all conversions recorded by the Facebook pixel on your website and attributed to your ads.',
    'type': 'list<AdsActionStats>'
  },
  'wish_bid': {
    'description': 'wish_bid',
    'type': 'numeric string',
    'GoogleBigQueryType': 'numeric'
  },
  'action_device': {
    'description': 'The device on which the conversion event you\'re tracking occurred. For example, \""Desktop\"" if someone converted on a desktop computer.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_canvas_component_name': {
    'description': 'Name of a component within a Canvas ad.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_carousel_card_id': {
    'description': 'The ID of the specific carousel card that people engaged with when they saw your ad.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'action_carousel_card_name': {
    'description': 'The specific carousel card that people engaged with when they saw your ad. The cards are identified by their headlines.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_destination': {
    'description': 'The destination where people go after clicking on your ad. This could be your Facebook Page, an external URL for your conversion pixel or an app configured with the software development kit (SDK).',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_reaction': {
    'description': 'The number of reactions on your ads or boosted posts. The reactions button on an ad allows people to share different reactions on its content: Like, Love, Haha, Wow, Sad or Angry.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_target_id': {
    'description': 'The ID of destination where people go after clicking on your ad. This could be your Facebook Page, an external URL for your conversion pixel or an app configured with the software development kit (SDK).',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'action_type': {
    'description': 'The kind of actions taken on your ad, page, app or event after your ad was served to someone, even if they didn\'t click on it. Action types include page likes, app installs, conversions, event responses, and more.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_video_sound': {
    'description': 'The sound status (on/off) when someone plays your video ad.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'action_video_type': {
    'description': 'Video metrics breakdown.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'ad_format_asset': {
    'description': 'The ID of the ad format asset involved in impression, click, or action',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'age': {
    'description': 'The age range of the people you\'ve reached.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'app_id': {
    'description': 'The ID of the application associated with the ad account or campaign requested. The application information, including its ID, is viewable in the App Dashboard.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'body_asset': {
    'description': 'The ID of the body asset involved in impression, click, or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'call_to_action_asset': {
    'description': 'The ID of the call to action asset involved in impression, click, or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'country': {
    'description': 'The country where the people you\'ve reached are located. This is based on information, such as a person\'s hometown, their current city, and the geographical location where they tend to be when they visit Meta.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'description_asset': {
    'description': 'The ID of the description asset involved in impression, click, or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'device_platform': {
    'description': 'The type of device, mobile or desktop, used by people when they viewed or clicked on an ad, as shown in ads reporting.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'dma': {
    'description': 'The Designated Market Area (DMA) regions are the 210 geographic areas in the United States in which local television viewing is measured by The Nielsen Company.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'frequency_value': {
    'description': 'The number of times an ad in your Reach and Frequency campaign was served to each Accounts Center account.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'gender': {
    'description': 'Gender of people you\'ve reached. People who don\'t list their gender are shown as \'not specified\'.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'hourly_stats_aggregated_by_advertiser_time_zone': {
    'description': 'Hourly breakdown aggregated by the time ads were delivered in the advertiser\'s time zone. For example, if your ads are scheduled to run from 9 AM to 11 AM, but they reach audiences in multiple time zones, they may deliver from 9 AM to 1 PM in the advertiser\'s time zone. Stats will be aggregated into four groups 9 AM - 10 AM, 10 AM - 11 AM, 11 AM - 12 PM, and 12 PM - 1 PM.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'hourly_stats_aggregated_by_audience_time_zone': {
    'description': 'Hourly breakdown aggregated by the time ads were delivered in the audiences\' time zone. For example, if your ads are scheduled to run from 9:00 am to 11:00 am, but they reach audiences in multiple time zones, they may deliver from 9:00 am to 1:00 pm in the advertiser\'s time zone. Stats are aggregated into 2 groups: 9:00 am to 10:00 am and 10:00 am to 11:00 am.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'image_asset': {
    'description': 'The ID of the image asset involved in impression, click, or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'impression_device': {
    'description': 'The device where your last ad was served to someone on Meta. For example \""iPhone\"" if someone viewed your ad on an iPhone.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'is_conversion_id_modeled': {
    'description': 'A boolean flag that indicates whether the conversion_bits are modeled. A 0 indicates conversion_bits aren\'t modeled, and a 1 indicates that conversion_bits are modeled.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'link_url_asset': {
    'description': 'The ID of the URL asset involved in impression, click or action.',
    'type': 'object',
    'fieldType': 'breakdown'
  },
  'place_page_id': {
    'description': 'The ID of the place page involved in impression or click.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'platform_position': {
    'description': 'Where your ad was shown within a platform, for example on Facebook desktop Feed, or Instagram Mobile Feed.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'product_id': {
    'description': 'The ID of the product involved in impression, click, or action.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'publisher_platform': {
    'description': 'Which platform your ad was shown, for example on Facebook, Instagram, or Audience Network.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'region': {
    'description': 'The regions where the people you\'ve reached are located. This is based on information such as a person\'s hometown, their current city and the geographical location where they tend to be when they visit Facebook.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'skan_campaign_id': {
    'description': 'The raw campaign ID received as a part of Skan postback from iOS 15+.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'skan_conversion_id': {
    'description': 'The assigned Conversion ID (also referred to as Priority ID) of the event and/or event bundle configured in the application’s SKAdNetwork configuration schema. The app events configuration can be viewed and adjusted in Meta Events Manager. You can learn more about configuring your app events for Apple\'s SKAdNetwork here.',
    'type': 'string',
    'GoogleSheetsFormat': '@',
    'fieldType': 'breakdown'
  },
  'title_asset': {
    'description': 'The ID of the title asset involved in impression, click or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'user_segment_key': {
    'description': 'User segment (ex: new, existing) of Advantage+ Shopping Campaigns (ASC). Existing user is specified by the custom audience in ASC settings.',
    'type': 'string',
    'fieldType': 'breakdown'
  },
  'video_asset': {
    'description': 'The ID of the video asset involved in impression, click or action.',
    'type': 'string',
    'fieldType': 'breakdown'
  }
}
