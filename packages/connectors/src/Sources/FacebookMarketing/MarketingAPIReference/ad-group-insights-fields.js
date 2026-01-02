/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adGroupInsightsFields = {
  'account_currency': {
    'description': 'Currency that is used by your ad account.',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'The ID number of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing.',
    'type': DATA_TYPES.STRING
  },
  'account_name': {
    'description': 'The name of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing.',
    'type': DATA_TYPES.STRING
  },
  'action_values': {
    'description': 'The total value of all conversions attributed to your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'actions': {
    'description': 'The total number of actions people took that are attributed to your ads. Actions may include engagement, clicks or conversions.',
    'type': DATA_TYPES.ARRAY
  },
  'activity_recency': {
    'description': 'activity_recency',
    'type': DATA_TYPES.STRING
  },
  'ad_click_actions': {
    'description': 'ad_click_actions',
    'type': DATA_TYPES.ARRAY
  },
  'ad_format_asset': {
    'description': 'ad_format_asset',
    'type': DATA_TYPES.STRING
  },
  'ad_id': {
    'description': 'The unique ID of the ad you\'re viewing in reporting.',
    'type': DATA_TYPES.STRING
  },
  'ad_impression_actions': {
    'description': 'ad_impression_actions',
    'type': DATA_TYPES.ARRAY  
  },
  'ad_name': {
    'description': 'The name of the ad you\'re viewing in reporting.',
    'type': DATA_TYPES.STRING
  },
  'adset_id': {
    'description': 'The unique ID of the ad set you\'re viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting.',
    'type': DATA_TYPES.STRING
  },
  'adset_name': {
    'description': 'The name of the ad set you\'re viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting.',
    'type': DATA_TYPES.STRING
  },
  'age_targeting': {
    'description': 'age_targeting',
    'type': DATA_TYPES.STRING
  },
  'attribution_setting': {
    'description': 'The default attribution window to be used when attribution result is calculated. Each ad set has its own attribution setting value. The attribution setting for campaign or account is calculated based on existing ad sets.',
    'type': DATA_TYPES.STRING
  },
  'auction_bid': {
    'description': 'auction_bid',
    'type': DATA_TYPES.STRING
  },
  'auction_competitiveness': {
    'description': 'auction_competitiveness',
    'type': DATA_TYPES.STRING
  },
  'auction_max_competitor_bid': {
    'description': 'auction_max_competitor_bid',
    'type': DATA_TYPES.STRING
  },
  'body_asset': {
    'description': 'body_asset',
    'type': DATA_TYPES.OBJECT
  },
  'buying_type': {
    'description': 'The method by which you pay for and target ads in your campaigns: through dynamic auction bidding, fixed-price bidding, or reach and frequency buying. This field is currently only visible at the campaign level.',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'The unique ID number of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': DATA_TYPES.STRING
  },
  'campaign_name': {
    'description': 'The name of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': DATA_TYPES.STRING
  },
  'canvas_avg_view_percent': {
    'description': 'The average percentage of the Instant Experience that people saw. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': DATA_TYPES.STRING
  },
  'canvas_avg_view_time': {
    'description': 'The average total time, in seconds, that people spent viewing an Instant Experience. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': DATA_TYPES.STRING
  },
  'catalog_segment_actions': {
    'description': 'The number of actions performed attributed to your ads promoting your catalog segment, broken down by action type.',
    'type': DATA_TYPES.ARRAY
  },
  'catalog_segment_value': {
    'description': 'The total value of all conversions from your catalog segment attributed to your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'catalog_segment_value_mobile_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from mobile app purchases for your catalog segment.',
    'type': DATA_TYPES.ARRAY
  },
  'catalog_segment_value_omni_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from all purchases for your catalog segment.',
    'type': DATA_TYPES.ARRAY
  },
  'catalog_segment_value_website_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from website purchases for your catalog segment.',
    'type': DATA_TYPES.ARRAY
  },
  'clicks': {
    'description': 'The number of clicks on your ads.',
    'type': DATA_TYPES.STRING
  },
  'coarse_conversion_value': {
    'description': 'Allows advertisers and ad networks to receive directional post-install quality insights when the volume of campaign conversions isn\'t high enough to meet the privacy threshold needed to unlock the standard conversion value. Possible values of this breakdown are low, medium and high.',
    'type': DATA_TYPES.STRING
  },
  'comparison_node': {
    'description': 'Parent node that encapsulates fields to be compared (current time range Vs comparison time range)',
    'type': DATA_TYPES.OBJECT
  },
  'conversion_values': {
    'description': 'conversion_values',
    'type': DATA_TYPES.ARRAY
  },
  'conversions': {
    'description': 'conversions',
    'type': DATA_TYPES.ARRAY
  },
  'converted_product_quantity': {
    'description': 'The number of products purchased which are recorded by your merchant partner\'s pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown.',
    'type': DATA_TYPES.ARRAY
  },
  'converted_product_value': {
    'description': 'The value of purchases recorded by your merchant partner\'s pixel or app SDK for a given product ID and driven by your ads. Has to be used together with converted product ID breakdown.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_15_sec_video_view': {
    'description': 'cost_per_15_sec_video_view',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_2_sec_continuous_video_view': {
    'description': 'cost_per_2_sec_continuous_video_view',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_action_type': {
    'description': 'The average cost of a relevant action.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_ad_click': {
    'description': 'cost_per_ad_click',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_conversion': {
    'description': 'cost_per_conversion',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_dda_countby_convs': {
    'description': 'cost_per_dda_countby_convs',
    'type': DATA_TYPES.STRING
  },
  'cost_per_inline_link_click': {
    'description': 'The average cost of each inline link click.',
    'type': DATA_TYPES.STRING
  },
  'cost_per_inline_post_engagement': {
    'description': 'The average cost of each inline post engagement.',
    'type': DATA_TYPES.STRING
  },
  'cost_per_one_thousand_ad_impression': {
    'description': 'cost_per_one_thousand_ad_impression',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_outbound_click': {
    'description': 'The average cost for each outbound click.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_thruplay': {
    'description': 'The average cost for each ThruPlay. This metric is in development.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_unique_action_type': {
    'description': 'The average cost of each unique action. This metric is estimated.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_unique_click': {
    'description': 'The average cost for each unique click (all). This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'cost_per_unique_conversion': {
    'description': 'cost_per_unique_conversion',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_unique_inline_link_click': {
    'description': 'The average cost of each unique inline link click. This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'cost_per_unique_outbound_click': {
    'description': 'The average cost for each unique outbound click. This metric is estimated.',
    'type': DATA_TYPES.ARRAY
  },
  'country': {
    'description': 'country',
    'type': DATA_TYPES.STRING
  },
  'cpc': {
    'description': 'The average cost for each click (all).',
    'type': DATA_TYPES.STRING
  },
  'cpm': {
    'description': 'The average cost for 1,000 impressions.',
    'type': DATA_TYPES.STRING
  },
  'cpp': {
    'description': 'The average cost to reach 1,000 people. This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'created_time': {
    'description': 'created_time',
    'type': DATA_TYPES.STRING
  },
  'ctr': {
    'description': 'The percentage of times people saw your ad and performed a click (all).',
    'type': DATA_TYPES.STRING
  },
  'date_start': {
    'description': 'The start date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': DATA_TYPES.STRING
  },
  'date_stop': {
    'description': 'The end date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': DATA_TYPES.STRING
  },
  'dda_countby_convs': {
    'description': 'dda_countby_convs',
    'type': DATA_TYPES.STRING
  },
  'dda_results': {
    'description': 'dda_results',
    'type': DATA_TYPES.ARRAY
  },
  'description_asset': {
    'description': 'description_asset',
    'type': DATA_TYPES.OBJECT
  },
  'device_platform': {
    'description': 'device_platform',
    'type': DATA_TYPES.STRING
  },
  'dma': {
    'description': 'dma',
    'type': DATA_TYPES.STRING
  },
  'estimated_ad_recall_rate_lower_bound': {
    'description': 'estimated_ad_recall_rate_lower_bound',
    'type': DATA_TYPES.STRING
  },
  'estimated_ad_recall_rate_upper_bound': {
    'description': 'estimated_ad_recall_rate_upper_bound',
    'type': DATA_TYPES.STRING
  },
  'estimated_ad_recallers_lower_bound': {
    'description': 'estimated_ad_recallers_lower_bound',
    'type': DATA_TYPES.STRING
  },
  'estimated_ad_recallers_upper_bound': {
    'description': 'estimated_ad_recallers_upper_bound',
    'type': DATA_TYPES.STRING
  },
  'fidelity_type': {
    'description': 'To differentiate StoreKit-rendered ads from view-through ads, SKAdNetwork defines a fidelity-type parameter, which you include in the ad signature and receive in the install-validation postback. Use a fidelity-type value of 1 for StoreKit-rendered ads and attributable web ads, and 0 for view-through ads.',
    'type': DATA_TYPES.STRING
  },
  'frequency': {
    'description': 'The average number of times each person saw your ad. This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'frequency_value': {
    'description': 'frequency_value',
    'type': DATA_TYPES.STRING
  },
  'full_view_impressions': {
    'description': 'The number of Full Views on your Page\'s posts as a result of your ad.',
    'type': DATA_TYPES.STRING
  },
  'full_view_reach': {
    'description': 'The number of people who performed a Full View on your Page\'s post as a result of your ad.',
    'type': DATA_TYPES.STRING
  },
  'gender_targeting': {
    'description': 'gender_targeting',
    'type': DATA_TYPES.STRING
  },
  'hourly_stats_aggregated_by_advertiser_time_zone': {
    'description': 'hourly_stats_aggregated_by_advertiser_time_zone',
    'type': DATA_TYPES.STRING
  },
  'hourly_stats_aggregated_by_audience_time_zone': {
    'description': 'hourly_stats_aggregated_by_audience_time_zone',
    'type': DATA_TYPES.STRING
  },
  'hsid': {
    'description': 'The hsid key is available for ad impressions that use SKAdNetwork 4 and later. This integer can have up to four digits. You can encode information about your advertisement in each set of digits; you may receive two, three, or all four digits of the sourceIdentifier in the first winning postback, depending on the ad impression\'s postback data tier.',
    'type': DATA_TYPES.STRING
  },
  'image_asset': {
    'description': 'image_asset',
    'type': DATA_TYPES.OBJECT
  },
  'impression_device': {
    'description': 'impression_device',
    'type': DATA_TYPES.STRING
  },
  'impressions': {
    'description': 'The number of times your ads were on screen.',
    'type': DATA_TYPES.STRING
  },
  'inline_link_click_ctr': {
    'description': 'The percentage of time people saw your ads and performed an inline link click.',
    'type': DATA_TYPES.STRING
  },
  'inline_link_clicks': {
    'description': 'The number of clicks on links to select destinations or experiences, on or off Facebook-owned properties. Inline link clicks use a fixed 1-day-click attribution window.',
    'type': DATA_TYPES.STRING
  },
  'inline_post_engagement': {
    'description': 'The total number of actions that people take involving your ads. Inline post engagements use a fixed 1-day-click attribution window.',
    'type': DATA_TYPES.STRING
  },
  'instagram_upcoming_event_reminders_set': {
    'description': 'instagram_upcoming_event_reminders_set',
    'type': DATA_TYPES.STRING
  },
  'instant_experience_clicks_to_open': {
    'description': 'instant_experience_clicks_to_open',
    'type': DATA_TYPES.STRING
  },
  'instant_experience_clicks_to_start': {
    'description': 'instant_experience_clicks_to_start',
    'type': DATA_TYPES.STRING
  },
  'instant_experience_outbound_clicks': {
    'description': 'instant_experience_outbound_clicks',
    'type': DATA_TYPES.ARRAY
  },
  'interactive_component_tap': {
    'description': 'interactive_component_tap',
    'type': DATA_TYPES.ARRAY
  },
  'labels': {
    'description': 'labels',
    'type': DATA_TYPES.STRING
  },
  'landing_destination': {
    'description': 'landing_destination',
    'type': DATA_TYPES.STRING
  },
  'location': {
    'description': 'location',
    'type': DATA_TYPES.STRING
  },
  'marketing_messages_delivery_rate': {
    'description': 'The number of messages delivered divided by the number of messages sent. Some messages may not be delivered, such as when a customer\'s device is out of service. This metric doesn\'t include messages sent to Europe and Japan.',
    'type': DATA_TYPES.STRING
  },
  'media_asset': {
    'description': 'media_asset',
    'type': 'AdAssetMedia'
  },
  'mobile_app_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from mobile app purchases. This is based on the value that you assigned when you set up the app event.',
    'type': DATA_TYPES.ARRAY
  },
  'objective': {
    'description': 'The objective reflecting the goal you want to achieve with your advertising. It may be different from the selected objective of the campaign in some cases.',
    'type': DATA_TYPES.STRING
  },
  'optimization_goal': {
    'description': 'The optimization goal you selected for your ad or ad set. Your optimization goal reflects what you want to optimize for the ads.',
    'type': DATA_TYPES.STRING
  },
  'outbound_clicks': {
    'description': 'The number of clicks on links that take people off Facebook-owned properties.',
    'type': DATA_TYPES.ARRAY
  },
  'outbound_clicks_ctr': {
    'description': 'The percentage of times people saw your ad and performed an outbound click.',
    'type': DATA_TYPES.ARRAY
  },
  'platform_position': {
    'description': 'platform_position',
    'type': DATA_TYPES.STRING
  },
  'postback_sequence_index': {
    'description': 'Sequence of postbacks received from SkAdNetwork API version 4.0. Possible values of this breakdown are 0 (first postback), 1 (second postback) and 2 (third postback).',
    'type': DATA_TYPES.STRING
  },
  'product_id': {
    'description': 'product_id',
    'type': DATA_TYPES.STRING
  },
  'publisher_platform': {
    'description': 'publisher_platform',
    'type': DATA_TYPES.STRING
  },
  'purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from purchases. This is based on information received from one or more of your connected Facebook Business Tools and attributed to your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'qualifying_question_qualify_answer_rate': {
    'description': 'qualifying_question_qualify_answer_rate',
    'type': DATA_TYPES.STRING
  },
  'reach': {
    'description': 'The number of people who saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same people. This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'redownload': {
    'description': 'Boolean flag that indicates the customer redownloaded and reinstalled the app when the value is true. A 1 indicates customer has reinstalled the app and 0 indicates that customer hasn’t reinstalled the app',
    'type': DATA_TYPES.STRING
  },
  'rule_asset': {
    'description': 'rule_asset',
    'type': DATA_TYPES.OBJECT
  },
  'shops_assisted_purchases': {
    'description': 'shops_assisted_purchases',
    'type': DATA_TYPES.STRING
  },
  'social_spend': {
    'description': 'The total amount you\'ve spent so far for your ads showed with social information. (ex: Jane Doe likes this).',
    'type': DATA_TYPES.STRING
  },
  'spend': {
    'description': 'The estimated total amount of money you\'ve spent on your campaign, ad set or ad during its schedule. This metric is estimated.',
    'type': DATA_TYPES.STRING
  },
  'title_asset': {
    'description': 'title_asset',
    'type': DATA_TYPES.OBJECT
  },
  'updated_time': {
    'description': 'updated_time',
    'type': DATA_TYPES.STRING
  },
  'user_segment_key': {
    'description': 'user_segment_key',
    'type': DATA_TYPES.STRING
  },
  'video_30_sec_watched_actions': {
    'description': 'The number of times your video played for at least 30 seconds, or for nearly its total length if it\'s shorter than 30 seconds. For each impression of a video, we\'ll count video views separately and exclude any time spent replaying the video.',
    'type': DATA_TYPES.ARRAY
  },
  'video_asset': {
    'description': 'video_asset',
    'type': DATA_TYPES.OBJECT
  },
  'video_avg_time_watched_actions': {
    'description': 'The average time a video was played, including any time spent replaying the video for a single impression.',
    'type': DATA_TYPES.ARRAY
  },
  'video_continuous_2_sec_watched_actions': {
    'description': 'video_continuous_2_sec_watched_actions',
    'type': DATA_TYPES.ARRAY
  },
  'video_p100_watched_actions': {
    'description': 'The number of times your video was played at 100% of its length, including plays that skipped to this point.',
    'type': DATA_TYPES.ARRAY
  },
  'video_p25_watched_actions': {
    'description': 'The number of times your video was played at 25% of its length, including plays that skipped to this point.',
    'type': DATA_TYPES.ARRAY
  },
  'video_p50_watched_actions': {
    'description': 'The number of times your video was played at 50% of its length, including plays that skipped to this point.',
    'type': DATA_TYPES.ARRAY
  },
  'video_p75_watched_actions': {
    'description': 'The number of times your video was played at 75% of its length, including plays that skipped to this point.',
    'type': DATA_TYPES.ARRAY
  },
  'video_p95_watched_actions': {
    'description': 'The number of times your video was played at 95% of its length, including plays that skipped to this point.',
    'type': DATA_TYPES.ARRAY
  },
  'video_play_actions': {
    'description': 'The number of times your video starts to play. This is counted for each impression of a video, and excludes replays. This metric is in development.',
    'type': DATA_TYPES.ARRAY
  },
  'video_play_curve_actions': {
    'description': 'A video-play based curve graph that illustrates the percentage of video plays that reached a given second. Entries 0 to 14 represent seconds 0 thru 14. Entries 15 to 17 represent second ranges [15 to 20), [20 to 25), and [25 to 30). Entries 18 to 20 represent second ranges [30 to 40), [40 to 50), and [50 to 60). Entry 21 represents plays over 60 seconds.',
    'type': DATA_TYPES.ARRAY
  },
  'video_play_retention_0_to_15s_actions': {
    'description': 'video_play_retention_0_to_15s_actions',
    'type': DATA_TYPES.ARRAY
  },
  'video_play_retention_20_to_60s_actions': {
    'description': 'video_play_retention_20_to_60s_actions',
    'type': DATA_TYPES.ARRAY
  },
  'video_play_retention_graph_actions': {
    'description': 'video_play_retention_graph_actions',
    'type': DATA_TYPES.ARRAY
  },
  'video_time_watched_actions': {
    'description': 'video_time_watched_actions',
    'type': DATA_TYPES.ARRAY
  },
  'website_ctr': {
    'description': 'The percentage of times people saw your ad and performed a link click.',
    'type': DATA_TYPES.ARRAY
  },
  'website_purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from website purchases. This is based on the value of all conversions recorded by the Facebook pixel on your website and attributed to your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'wish_bid': {
    'description': 'wish_bid',
    'type': DATA_TYPES.STRING
  }
  
}
  