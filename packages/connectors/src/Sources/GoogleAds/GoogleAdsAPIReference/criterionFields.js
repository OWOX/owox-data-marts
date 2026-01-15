/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var criterionFields = {
  'criterion_id': {
    'description': 'Criterion ID',
    'apiName': 'ad_group_criterion.criterion_id',
    'type': DATA_TYPES.STRING
  },
  'criterion_type': {
    'description': 'Criterion Type (KEYWORD, PLACEMENT, etc.)',
    'apiName': 'ad_group_criterion.type',
    'type': DATA_TYPES.STRING
  },
  'criterion_status': {
    'description': 'Criterion Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'ad_group_criterion.status',
    'type': DATA_TYPES.STRING
  },
  'keyword_text': {
    'description': 'Keyword Text',
    'apiName': 'ad_group_criterion.keyword.text',
    'type': DATA_TYPES.STRING
  },
  'keyword_match_type': {
    'description': 'Keyword Match Type (EXACT, PHRASE, BROAD)',
    'apiName': 'ad_group_criterion.keyword.match_type',
    'type': DATA_TYPES.STRING
  },
  'ad_group_id': {
    'description': 'Ad Group ID',
    'apiName': 'ad_group.id',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': DATA_TYPES.STRING
  },
  'quality_score': {
    'description': 'Quality Score',
    'apiName': 'ad_group_criterion.quality_info.quality_score',
    'type': DATA_TYPES.NUMBER
  },
  'final_urls': {
    'description': 'Final URLs',
    'apiName': 'ad_group_criterion.final_urls',
    'type': DATA_TYPES.ARRAY
  },
  'negative': {
    'description': 'Whether to target (false) or exclude (true) the criterion',
    'apiName': 'ad_group_criterion.negative',
    'type': DATA_TYPES.BOOLEAN
  },
  'cpc_bid_micros': {
    'description': 'CPC Bid in Micros',
    'apiName': 'ad_group_criterion.cpc_bid_micros',
    'type': DATA_TYPES.NUMBER
  },
  'effective_cpc_bid_micros': {
    'description': 'Effective CPC Bid in Micros (includes bid modifiers)',
    'apiName': 'ad_group_criterion.effective_cpc_bid_micros',
    'type': DATA_TYPES.NUMBER
  },
  'position_estimates_first_page_cpc_micros': {
    'description': 'Estimated CPC Bid needed to appear on first page',
    'apiName': 'ad_group_criterion.position_estimates.first_page_cpc_micros',
    'type': DATA_TYPES.NUMBER
  },
  'position_estimates_top_of_page_cpc_micros': {
    'description': 'Estimated CPC Bid needed to appear at top of page',
    'apiName': 'ad_group_criterion.position_estimates.top_of_page_cpc_micros',
    'type': DATA_TYPES.NUMBER
  },
  'position_estimates_first_position_cpc_micros': {
    'description': 'Estimated CPC Bid needed to appear in first position',
    'apiName': 'ad_group_criterion.position_estimates.first_position_cpc_micros',
    'type': DATA_TYPES.NUMBER
  },
  'ad_group_name': {
    'description': 'Ad Group Name',
    'apiName': 'ad_group.name',
    'type': DATA_TYPES.STRING
  },
  'campaign_name': {
    'description': 'Campaign Name',
    'apiName': 'campaign.name',
    'type': DATA_TYPES.STRING
  }
};

