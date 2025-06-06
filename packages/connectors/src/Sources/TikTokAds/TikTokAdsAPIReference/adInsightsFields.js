/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adInsightsFields = {
  'ad_id': {
    'description': 'Ad ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
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
  'adgroup_id': {
    'description': 'Ad Group ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'stat_time_day': {
    'description': 'Statistics Date',
    'type': 'datetime',
    'GoogleBigQueryType': 'date',
    'GoogleBigQueryPartitioned': true
  },
  'date_start': {
    'description': 'Start Date',
    'type': 'datetime',
    'GoogleBigQueryType': 'date'
  },
  'date_end': {
    'description': 'End Date',
    'type': 'datetime',
    'GoogleBigQueryType': 'date'
  },
  'impressions': {
    'description': 'Impressions',
    'type': 'int32'
  },
  'clicks': {
    'description': 'Clicks',
    'type': 'int32'
  },
  'cost': {
    'description': 'Cost',
    'type': 'float'
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'type': 'float'
  },
  'conversion': {
    'description': 'Conversions',
    'type': 'int32'
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'type': 'float'
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'type': 'float'
  },
  'reach': {
    'description': 'Reach',
    'type': 'int32'
  },
  'engagement': {
    'description': 'Engagement',
    'type': 'int32'
  },
  'video_views': {
    'description': 'Video Views',
    'type': 'int32'
  },
  'video_watched_2s': {
    'description': '2s Video Views',
    'type': 'int32'
  },
  'video_watched_6s': {
    'description': '6s Video Views',
    'type': 'int32'
  },
  'video_completion': {
    'description': 'Video Completion',
    'type': 'int32'
  },
  'spend': {
    'description': 'Spend',
    'type': 'float',
    'GoogleSheetsFormat': '$#,##0.00'
  },
  'cpc': {
    'description': 'Cost per click',
    'type': 'float'
  },
  'cpm': {
    'description': 'Cost per thousand impressions',
    'type': 'float'
  },
  'frequency': {
    'description': 'Frequency of occurrence',
    'type': 'float'
  },
  'video_play_actions': {
    'description': 'Number of video plays',
    'type': 'int32'
  },
  'video_views_p25': {
    'description': 'Video views at 25% completion',
    'type': 'int32'
  },
  'video_views_p50': {
    'description': 'Video views at 50% completion',
    'type': 'int32'
  },
  'video_views_p75': {
    'description': 'Video views at 75% completion',
    'type': 'int32'
  },
  'video_views_p100': {
    'description': 'Video views at 100% completion',
    'type': 'int32'
  },
  'profile_visits': {
    'description': 'Profile visits',
    'type': 'int32'
  },
  'likes': {
    'description': 'Likes count',
    'type': 'int32'
  },
  'comments': {
    'description': 'Comments count',
    'type': 'int32'
  },
  'shares': {
    'description': 'Shares count',
    'type': 'int32'
  },
  'follows': {
    'description': 'Follows count',
    'type': 'int32'
  },
  'real_time_conversion': {
    'description': 'Real-time conversions',
    'type': 'int32'
  },
  'real_time_cost_per_conversion': {
    'description': 'Cost per conversion in real-time',
    'type': 'float'
  },
  'real_time_conversion_rate': {
    'description': 'Real-time conversion rate',
    'type': 'float'
  },
  'result': {
    'description': 'Number of results',
    'type': 'int32'
  },
  'cost_per_result': {
    'description': 'Cost per result',
    'type': 'float'
  }
};
