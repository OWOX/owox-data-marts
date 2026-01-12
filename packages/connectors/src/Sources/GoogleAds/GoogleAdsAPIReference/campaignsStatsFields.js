/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignStatsFields = {
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': DATA_TYPES.STRING
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': DATA_TYPES.STRING
  },
  'campaign_status': {
    'description': 'Campaign Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'campaign.status',
    'type': DATA_TYPES.STRING
  },
  'date': {
    'description': 'Date for time series data',
    'apiName': 'segments.date',
    'type': DATA_TYPES.STRING
  },
  'impressions': {
    'description': 'Number of Impressions',
    'apiName': 'metrics.impressions',
    'type': DATA_TYPES.NUMBER
  },
  'clicks': {
    'description': 'Number of Clicks',
    'apiName': 'metrics.clicks',
    'type': DATA_TYPES.NUMBER
  },
  'cost_micros': {
    'description': 'Cost in Micros',
    'apiName': 'metrics.cost_micros',
    'type': DATA_TYPES.NUMBER
  },
  'conversions': {
    'description': 'Number of Conversions',
    'apiName': 'metrics.conversions',
    'type': DATA_TYPES.NUMBER
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'apiName': 'metrics.ctr',
    'type': DATA_TYPES.NUMBER
  },
  'average_cpc': {
    'description': 'Average Cost Per Click',
    'apiName': 'metrics.average_cpc',
    'type': DATA_TYPES.NUMBER
  },
  'conversions_value': {
    'description': 'Total Conversion Value',
    'apiName': 'metrics.conversions_value',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'apiName': 'metrics.cost_per_conversion',
    'type': DATA_TYPES.NUMBER
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'apiName': 'metrics.conversions_from_interactions_rate',
    'type': DATA_TYPES.NUMBER
  },
  'view_through_conversions': {
    'description': 'View-Through Conversions',
    'apiName': 'metrics.view_through_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'all_conversions': {
    'description': 'All Conversions',
    'apiName': 'metrics.all_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': DATA_TYPES.NUMBER
  },
  'cost_per_all_conversions': {
    'description': 'Cost Per All Conversions',
    'apiName': 'metrics.cost_per_all_conversions',
    'type': DATA_TYPES.NUMBER
  },
  'average_cost': {
    'description': 'Average Cost',
    'apiName': 'metrics.average_cost',
    'type': DATA_TYPES.NUMBER
  },
  'average_cpm': {
    'description': 'Average CPM',
    'apiName': 'metrics.average_cpm',
    'type': DATA_TYPES.NUMBER
  },
  'engagement_rate': {
    'description': 'Engagement Rate',
    'apiName': 'metrics.engagement_rate',
    'type': DATA_TYPES.NUMBER
  },
  'engagements': {
    'description': 'Number of Engagements',
    'apiName': 'metrics.engagements',
    'type': DATA_TYPES.NUMBER
  },
  'interactions': {
    'description': 'Number of Interactions',
    'apiName': 'metrics.interactions',
    'type': DATA_TYPES.NUMBER
  },
  'interaction_rate': {
    'description': 'Interaction Rate',
    'apiName': 'metrics.interaction_rate',
    'type': DATA_TYPES.NUMBER
  },
  'search_impression_share': {
    'description': 'Search Impression Share',
    'apiName': 'metrics.search_impression_share',
    'type': DATA_TYPES.NUMBER
  },
  'search_budget_lost_impression_share': {
    'description': 'Search Budget Lost Impression Share',
    'apiName': 'metrics.search_budget_lost_impression_share',
    'type': DATA_TYPES.NUMBER
  },
  'search_rank_lost_impression_share': {
    'description': 'Search Rank Lost Impression Share',
    'apiName': 'metrics.search_rank_lost_impression_share',
    'type': DATA_TYPES.NUMBER
  },
  'video_views': {
    'description': 'Video Views (for Video campaigns)',
    'apiName': 'metrics.video_views',
    'type': DATA_TYPES.NUMBER
  },
  'video_view_rate': {
    'description': 'Video View Rate',
    'apiName': 'metrics.video_view_rate',
    'type': DATA_TYPES.NUMBER
  }
};

