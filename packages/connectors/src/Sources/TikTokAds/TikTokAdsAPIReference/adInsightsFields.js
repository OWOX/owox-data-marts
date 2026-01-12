/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adInsightsFields = {
  'ad_id': {
    'description': 'Ad ID',
    'type': DATA_TYPES.STRING
  },
  'advertiser_id': {
    'description': 'Advertiser ID',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'type': DATA_TYPES.STRING
  },
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': DATA_TYPES.STRING
  },
  'stat_time_day': {
    'description': 'Statistics Date',
    'type': DATA_TYPES.DATE,
    'GoogleBigQueryPartitioned': true
  },
  'date_start': {
    'description': 'Start Date',
    'type': DATA_TYPES.DATE
  },
  'date_end': {
    'description': 'End Date',
    'type': DATA_TYPES.DATE
  },
  'impressions': {
    'description': 'Impressions',
    'type': DATA_TYPES.INTEGER
  },
  'clicks': {
    'description': 'Clicks',
    'type': DATA_TYPES.INTEGER
  },
  'cost': {
    'description': 'Cost',
    'type': DATA_TYPES.NUMBER
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'type': DATA_TYPES.NUMBER
  },
  'conversion': {
    'description': 'Conversions',
    'type': DATA_TYPES.INTEGER
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'type': DATA_TYPES.NUMBER
  },
  'reach': {
    'description': 'Reach',
    'type': DATA_TYPES.INTEGER
  },
  'engagement': {
    'description': 'Engagement',
    'type': DATA_TYPES.INTEGER
  },
  'video_views': {
    'description': 'Video Views',
    'type': DATA_TYPES.INTEGER
  },
  'video_watched_2s': {
    'description': '2s Video Views',
    'type': DATA_TYPES.INTEGER
  },
  'video_watched_6s': {
    'description': '6s Video Views',
    'type': DATA_TYPES.INTEGER
  },
  'video_completion': {
    'description': 'Video Completion',
    'type': DATA_TYPES.INTEGER
  },
  'spend': {
    'description': 'Spend',
    'type': DATA_TYPES.NUMBER,
  },
  'cpc': {
    'description': 'Cost per click',
    'type': DATA_TYPES.NUMBER
  },
  'cpm': {
    'description': 'Cost per thousand impressions',
    'type': DATA_TYPES.NUMBER
  },
  'frequency': {
    'description': 'Frequency of occurrence',
    'type': DATA_TYPES.NUMBER
  },
  'video_play_actions': {
    'description': 'Number of video plays',
    'type': DATA_TYPES.INTEGER
  },
  'video_views_p25': {
    'description': 'Video views at 25% completion',
    'type': DATA_TYPES.INTEGER
  },
  'video_views_p50': {
    'description': 'Video views at 50% completion',
    'type': DATA_TYPES.INTEGER
  },
  'video_views_p75': {
    'description': 'Video views at 75% completion',
    'type': DATA_TYPES.INTEGER
  },
  'video_views_p100': {
    'description': 'Video views at 100% completion',
    'type': DATA_TYPES.INTEGER
  },
  'profile_visits': {
    'description': 'Profile visits',
    'type': DATA_TYPES.INTEGER
  },
  'likes': {
    'description': 'Likes count',
    'type': DATA_TYPES.INTEGER
  },
  'comments': {
    'description': 'Comments count',
    'type': DATA_TYPES.INTEGER
  },
  'shares': {
    'description': 'Shares count',
    'type': DATA_TYPES.INTEGER
  },
  'follows': {
    'description': 'Follows count',
    'type': DATA_TYPES.INTEGER
  },
  'real_time_conversion': {
    'description': 'Real-time conversions',
    'type': DATA_TYPES.INTEGER
  },
  'real_time_cost_per_conversion': {
    'description': 'Cost per conversion in real-time',
    'type': DATA_TYPES.NUMBER
  },
  'real_time_conversion_rate': {
    'description': 'Real-time conversion rate',
    'type': DATA_TYPES.NUMBER
  },
  'result': {
    'description': 'Number of results',
    'type': DATA_TYPES.INTEGER
  },
  'cost_per_result': {
    'description': 'Cost per result',
    'type': DATA_TYPES.NUMBER
  }
};
