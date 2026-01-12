/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var campaignFields = {
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
  'campaign_advertising_channel_type': {
    'description': 'Advertising Channel Type (SEARCH, DISPLAY, VIDEO, etc.)',
    'apiName': 'campaign.advertising_channel_type',
    'type': DATA_TYPES.STRING
  },
  'campaign_start_date': {
    'description': 'Campaign Start Date',
    'apiName': 'campaign.start_date',
    'type': DATA_TYPES.STRING
  },
  'campaign_end_date': {
    'description': 'Campaign End Date',
    'apiName': 'campaign.end_date',
    'type': DATA_TYPES.STRING
  },
  'campaign_bidding_strategy_type': {
    'description': 'Bidding Strategy Type (MANUAL_CPC, TARGET_CPA, TARGET_ROAS, etc.)',
    'apiName': 'campaign.bidding_strategy_type',
    'type': DATA_TYPES.STRING
  },
  'campaign_budget_amount_micros': {
    'description': 'Campaign Budget Amount in Micros',
    'apiName': 'campaign_budget.amount_micros',
    'type': DATA_TYPES.NUMBER
  },
  'campaign_target_cpa_micros': {
    'description': 'Target CPA in Micros (if using Target CPA bidding)',
    'apiName': 'campaign.target_cpa.target_cpa_micros',
    'type': DATA_TYPES.NUMBER
  },
  'campaign_target_roas': {
    'description': 'Target ROAS (if using Target ROAS bidding)',
    'apiName': 'campaign.target_roas.target_roas',
    'type': DATA_TYPES.NUMBER
  },
  'campaign_advertising_channel_sub_type': {
    'description': 'Advertising Channel Sub Type',
    'apiName': 'campaign.advertising_channel_sub_type',
    'type': DATA_TYPES.STRING
  }
};


