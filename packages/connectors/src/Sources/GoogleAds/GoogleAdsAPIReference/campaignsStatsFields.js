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
    'type': 'string'
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': 'string'
  },
  'campaign_status': {
    'description': 'Campaign Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'campaign.status',
    'type': 'string'
  },
  'date': {
    'description': 'Date for time series data',
    'apiName': 'segments.date',
    'type': 'string'
  },
  'impressions': {
    'description': 'Number of Impressions',
    'apiName': 'metrics.impressions',
    'type': 'number'
  },
  'clicks': {
    'description': 'Number of Clicks',
    'apiName': 'metrics.clicks',
    'type': 'number'
  },
  'cost_micros': {
    'description': 'Cost in Micros',
    'apiName': 'metrics.cost_micros',
    'type': 'number'
  },
  'conversions': {
    'description': 'Number of Conversions',
    'apiName': 'metrics.conversions',
    'type': 'number'
  },
  'ctr': {
    'description': 'Click-Through Rate',
    'apiName': 'metrics.ctr',
    'type': 'number'
  },
  'average_cpc': {
    'description': 'Average Cost Per Click',
    'apiName': 'metrics.average_cpc',
    'type': 'number'
  },
  'conversions_value': {
    'description': 'Total Conversion Value',
    'apiName': 'metrics.conversions_value',
    'type': 'number'
  },
  'cost_per_conversion': {
    'description': 'Cost Per Conversion',
    'apiName': 'metrics.cost_per_conversion',
    'type': 'number'
  },
  'conversion_rate': {
    'description': 'Conversion Rate',
    'apiName': 'metrics.conversions_from_interactions_rate',
    'type': 'number'
  },
  'view_through_conversions': {
    'description': 'View-Through Conversions',
    'apiName': 'metrics.view_through_conversions',
    'type': 'number'
  },
  'all_conversions': {
    'description': 'All Conversions',
    'apiName': 'metrics.all_conversions',
    'type': 'number'
  },
  'all_conversions_value': {
    'description': 'All Conversions Value',
    'apiName': 'metrics.all_conversions_value',
    'type': 'number'
  },
  'cost_per_all_conversions': {
    'description': 'Cost Per All Conversions',
    'apiName': 'metrics.cost_per_all_conversions',
    'type': 'number'
  },
  'average_cost': {
    'description': 'Average Cost',
    'apiName': 'metrics.average_cost',
    'type': 'number'
  },
  'average_cpm': {
    'description': 'Average CPM',
    'apiName': 'metrics.average_cpm',
    'type': 'number'
  },
  'engagement_rate': {
    'description': 'Engagement Rate',
    'apiName': 'metrics.engagement_rate',
    'type': 'number'
  },
  'engagements': {
    'description': 'Number of Engagements',
    'apiName': 'metrics.engagements',
    'type': 'number'
  },
  'interactions': {
    'description': 'Number of Interactions',
    'apiName': 'metrics.interactions',
    'type': 'number'
  },
  'interaction_rate': {
    'description': 'Interaction Rate',
    'apiName': 'metrics.interaction_rate',
    'type': 'number'
  },
  'search_impression_share': {
    'description': 'Search Impression Share',
    'apiName': 'metrics.search_impression_share',
    'type': 'number'
  },
  'search_budget_lost_impression_share': {
    'description': 'Search Budget Lost Impression Share',
    'apiName': 'metrics.search_budget_lost_impression_share',
    'type': 'number'
  },
  'search_rank_lost_impression_share': {
    'description': 'Search Rank Lost Impression Share',
    'apiName': 'metrics.search_rank_lost_impression_share',
    'type': 'number'
  },
  'video_views': {
    'description': 'Video Views (for Video campaigns)',
    'apiName': 'metrics.video_views',
    'type': 'number'
  },
  'video_view_rate': {
    'description': 'Video View Rate',
    'apiName': 'metrics.video_view_rate',
    'type': 'number'
  }
};

