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
    'type': 'string'
  },
  'criterion_type': {
    'description': 'Criterion Type (KEYWORD, PLACEMENT, etc.)',
    'apiName': 'ad_group_criterion.type',
    'type': 'string'
  },
  'criterion_status': {
    'description': 'Criterion Status (ENABLED, PAUSED, REMOVED)',
    'apiName': 'ad_group_criterion.status',
    'type': 'string'
  },
  'keyword_text': {
    'description': 'Keyword Text',
    'apiName': 'ad_group_criterion.keyword.text',
    'type': 'string'
  },
  'keyword_match_type': {
    'description': 'Keyword Match Type (EXACT, PHRASE, BROAD)',
    'apiName': 'ad_group_criterion.keyword.match_type',
    'type': 'string'
  },
  'ad_group_id': {
    'description': 'Ad Group ID',
    'apiName': 'ad_group.id',
    'type': 'string'
  },
  'campaign_id': {
    'description': 'Campaign ID',
    'apiName': 'campaign.id',
    'type': 'string'
  },
  'quality_score': {
    'description': 'Quality Score',
    'apiName': 'ad_group_criterion.quality_info.quality_score',
    'type': 'number'
  },
  'final_urls': {
    'description': 'Final URLs',
    'apiName': 'ad_group_criterion.final_urls',
    'type': 'array'
  },
  'negative': {
    'description': 'Whether to target (false) or exclude (true) the criterion',
    'apiName': 'ad_group_criterion.negative',
    'type': 'boolean'
  }
};

