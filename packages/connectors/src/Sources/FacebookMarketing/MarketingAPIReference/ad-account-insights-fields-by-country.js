/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/* eslint-disable no-unused-vars */
var adAccountInsightsFieldsByCountry = {
  'account_currency': {
    'description': 'Currency that is used by your ad account.',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'The ID number of your ad account, which groups your advertising activity. Your ad account includes your campaigns, ads and billing.',
    'type': DATA_TYPES.STRING,
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
  'ad_click_actions': {
    'description': 'ad_click_actions',
    'type': DATA_TYPES.ARRAY
  },
  'ad_id': {
    'description': 'The unique ID of the ad you\'re viewing in reporting.',
    'type': DATA_TYPES.STRING,
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
    'type': DATA_TYPES.STRING,
  },
  'adset_name': {
    'description': 'The name of the ad set you\'re viewing in reporting. An ad set is a group of ads that share the same budget, schedule, delivery optimization and targeting.',
    'type': DATA_TYPES.STRING
  },
  'attribution_setting': {
    'description': 'The default attribution window to be used when attribution result is calculated. Each ad set has its own attribution setting value. The attribution setting for campaign or account is calculated based on existing ad sets.',
    'type': DATA_TYPES.STRING
  },
  'auction_bid': {
    'description': 'auction_bid',
    'type': DATA_TYPES.NUMBER
  },
  'auction_competitiveness': {
    'description': 'auction_competitiveness',
    'type': DATA_TYPES.NUMBER
  },
  'auction_max_competitor_bid': {
    'description': 'auction_max_competitor_bid',
    'type': DATA_TYPES.NUMBER
  },
  'buying_type': {
    'description': 'The method by which you pay for and target ads in your campaigns: through dynamic auction bidding, fixed-price bidding, or reach and frequency buying. This field is currently only visible at the campaign level.',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'The unique ID number of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': DATA_TYPES.STRING,
  },
  'campaign_name': {
    'description': 'The name of the ad campaign you\'re viewing in reporting. Your campaign contains ad sets and ads.',
    'type': DATA_TYPES.STRING
  },
  'canvas_avg_view_percent': {
    'description': 'The average percentage of the Instant Experience that people saw. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': DATA_TYPES.NUMBER
  },
  'canvas_avg_view_time': {
    'description': 'The average total time, in seconds, that people spent viewing an Instant Experience. An Instant Experience is a screen that opens after someone interacts with your ad on a mobile device. It may include a series of interactive or multimedia components, including video, images product catalog and more.',
    'type': DATA_TYPES.NUMBER
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
    'type': DATA_TYPES.NUMBER
  },
  'country': {
    'description': 'The country where the people you\'ve reached are located. This is based on information, such as a person\'s hometown, their current city, and the geographical location where they tend to be when they visit Meta.',
    'type': DATA_TYPES.STRING
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
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_inline_link_click': {
    'description': 'The average cost of each inline link click.',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_inline_post_engagement': {
    'description': 'The average cost of each inline post engagement.',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_one_thousand_ad_impression': {
    'description': 'cost_per_one_thousand_ad_impression',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_outbound_click': {
    'description': 'The average cost for each outbound click.',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_result': {
    'description': 'The average cost per result from your ads.',
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
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_unique_conversion': {
    'description': 'cost_per_unique_conversion',
    'type': DATA_TYPES.ARRAY
  },
  'cost_per_unique_inline_link_click': {
    'description': 'The average cost of each unique inline link click. This metric is estimated.',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_unique_outbound_click': {
    'description': 'The average cost for each unique outbound click. This metric is estimated.',
    'type': DATA_TYPES.ARRAY
  },
  'cpc': {
    'description': 'The average cost for each click (all).',
    'type': DATA_TYPES.NUMBER
  },
  'cpm': {
    'description': 'The average cost for 1,000 impressions.',
    'type': DATA_TYPES.NUMBER
  },
  'cpp': {
    'description': 'The average cost to reach 1,000 people. This metric is estimated.',
    'type': DATA_TYPES.NUMBER
  },
  'created_time': {
    'description': 'created_time',
    'type': DATA_TYPES.STRING
  },
  'ctr': {
    'description': 'The percentage of times people saw your ad and performed a click (all).',
    'type': DATA_TYPES.NUMBER
  },
  'date_start': {
    'description': 'The start date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': DATA_TYPES.DATE,
    'GoogleBigQueryPartitioned': true
  },
  'date_stop': {
    'description': 'The end date for your data. This is controlled by the date range you\'ve selected for your reporting view.',
    'type': DATA_TYPES.DATE
  },
  'dda_countby_convs': {
    'description': 'dda_countby_convs',
    'type': DATA_TYPES.NUMBER
  },
  'dda_results': {
    'description': 'dda_results',
    'type': DATA_TYPES.ARRAY
  },
  'frequency': {
    'description': 'The average number of times each person saw your ad. This metric is estimated.',
    'type': DATA_TYPES.NUMBER
  },
  'full_view_impressions': {
    'description': 'The number of Full Views on your Page\'s posts as a result of your ad.',
    'type': DATA_TYPES.NUMBER
  },
  'full_view_reach': {
    'description': 'The number of people who performed a Full View on your Page\'s post as a result of your ad.',
    'type': DATA_TYPES.NUMBER
  },
  'impressions': {
    'description': 'The number of times your ads were on screen.',
    'type': DATA_TYPES.NUMBER
  },
  'inline_link_click_ctr': {
    'description': 'The percentage of time people saw your ads and performed an inline link click.',
    'type': DATA_TYPES.NUMBER
  },
  'inline_link_clicks': {
    'description': 'The number of clicks on links to select destinations or experiences, on or off Facebook-owned properties. Inline link clicks use a fixed 1-day-click attribution window.',
    'type': DATA_TYPES.NUMBER
  },
  'inline_post_engagement': {
    'description': 'The total number of actions that people take involving your ads. Inline post engagements use a fixed 1-day-click attribution window.',
    'type': DATA_TYPES.NUMBER
  },
  'instagram_upcoming_event_reminders_set': {
    'description': 'instagram_upcoming_event_reminders_set',
    'type': DATA_TYPES.NUMBER
  },
  'instant_experience_clicks_to_open': {
    'description': 'instant_experience_clicks_to_open',
    'type': DATA_TYPES.NUMBER
  },
  'instant_experience_clicks_to_start': {
    'description': 'instant_experience_clicks_to_start',
    'type': DATA_TYPES.NUMBER
  },
  'instant_experience_outbound_clicks': {
    'description': 'instant_experience_outbound_clicks',
    'type': DATA_TYPES.ARRAY
  },
  'interactive_component_tap': {
    'description': 'interactive_component_tap',
    'type': DATA_TYPES.ARRAY
  },
  'marketing_messages_delivery_rate': {
    'description': 'The number of messages delivered divided by the number of messages sent. Some messages may not be delivered, such as when a customer\'s device is out of service. This metric doesn\'t include messages sent to Europe and Japan.',
    'type': DATA_TYPES.NUMBER
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
  'purchase_roas': {
    'description': 'The total return on ad spend (ROAS) from purchases. This is based on information received from one or more of your connected Facebook Business Tools and attributed to your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'qualifying_question_qualify_answer_rate': {
    'description': 'qualifying_question_qualify_answer_rate',
    'type': DATA_TYPES.NUMBER
  },
  'reach': {
    'description': 'The number of people who saw your ads at least once. Reach is different from impressions, which may include multiple views of your ads by the same people. This metric is estimated.',
    'type': DATA_TYPES.NUMBER
  },
  'result_rate': {
    'description': 'The result rate from your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'results': {
    'description': 'The number of results from your ads.',
    'type': DATA_TYPES.ARRAY
  },
  'shops_assisted_purchases': {
    'description': 'shops_assisted_purchases',
    'type': DATA_TYPES.STRING
  },
  'social_spend': {
    'description': 'The total amount you\'ve spent so far for your ads showed with social information. (ex: Jane Doe likes this).',
    'type': DATA_TYPES.NUMBER
  },
  'spend': {
    'description': 'The estimated total amount of money you\'ve spent on your campaign, ad set or ad during its schedule. This metric is estimated.',
    'type': DATA_TYPES.NUMBER,
  },
  'updated_time': {
    'description': 'updated_time',
    'type': DATA_TYPES.STRING
  },
  'video_30_sec_watched_actions': {
    'description': 'The number of times your video played for at least 30 seconds, or for nearly its total length if it\'s shorter than 30 seconds. For each impression of a video, we\'ll count video views separately and exclude any time spent replaying the video.',
    'type': DATA_TYPES.ARRAY
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
    'type': DATA_TYPES.NUMBER
  }
}

