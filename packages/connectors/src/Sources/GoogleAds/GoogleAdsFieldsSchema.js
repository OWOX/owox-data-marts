/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const GoogleAdsFieldsSchema = {
  campaigns: {
    fields: {
      campaign_id: { type: 'string' },
      campaign_name: { type: 'string' },
      campaign_status: { type: 'string' },
      campaign_advertising_channel_type: { type: 'string' },
      campaign_budget_amount_micros: { type: 'number' },
      campaign_start_date: { type: 'string' },
      campaign_end_date: { type: 'string' },
      segments_date: { type: 'string' },
      metrics_impressions: { type: 'number' },
      metrics_clicks: { type: 'number' },
      metrics_cost_micros: { type: 'number' },
      metrics_conversions: { type: 'number' },
      metrics_ctr: { type: 'number' },
      metrics_average_cpc: { type: 'number' }
    },
    uniqueKeys: ['campaign_id', 'segments_date']
  },
  
  ad_groups: {
    fields: {
      ad_group_id: { type: 'string' },
      ad_group_name: { type: 'string' },
      ad_group_status: { type: 'string' },
      ad_group_type: { type: 'string' },
      campaign_id: { type: 'string' },
      campaign_name: { type: 'string' },
      metrics_impressions: { type: 'number' },
      metrics_clicks: { type: 'number' },
      metrics_cost_micros: { type: 'number' }
    },
    uniqueKeys: ['ad_group_id']
  },
  
  ads: {
    fields: {
      ad_group_ad_ad_id: { type: 'string' },
      ad_group_ad_status: { type: 'string' },
      ad_group_ad_ad_final_urls: { type: 'array' },
      ad_group_id: { type: 'string' },
      campaign_id: { type: 'string' },
      metrics_impressions: { type: 'number' },
      metrics_clicks: { type: 'number' },
      metrics_cost_micros: { type: 'number' }
    },
    uniqueKeys: ['ad_group_ad_ad_id']
  },
  
  keywords: {
    fields: {
      ad_group_criterion_criterion_id: { type: 'string' },
      ad_group_criterion_keyword_text: { type: 'string' },
      ad_group_criterion_keyword_match_type: { type: 'string' },
      ad_group_criterion_status: { type: 'string' },
      ad_group_id: { type: 'string' },
      campaign_id: { type: 'string' },
      metrics_impressions: { type: 'number' },
      metrics_clicks: { type: 'number' },
      metrics_cost_micros: { type: 'number' }
    },
    uniqueKeys: ['ad_group_criterion_criterion_id']
  }
};
