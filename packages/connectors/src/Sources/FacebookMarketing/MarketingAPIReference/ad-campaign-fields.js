/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCampaignFields = {
  'id': {
    'description': 'ID for the Ad Set',
    'type': DATA_TYPES.STRING
  },
  'account_id': {
    'description': 'ID for the Ad Account associated with this Ad Set',
    'type': DATA_TYPES.STRING
  },
  'adlabels': {
    'description': 'Ad Labels associated with this ad set',
    'type': DATA_TYPES.ARRAY
  },
  'adset_schedule': {
    'description': 'Ad set schedule, representing a delivery schedule for a single day',
    'type': DATA_TYPES.ARRAY
  },
  'asset_feed_id': {
    'description': 'The ID of the asset feed that constains a content to create ads',
    'type': DATA_TYPES.STRING
  },
  'attribution_spec': {
    'description': 'Conversion attribution spec used for attributing conversions for optimization. Supported window lengths differ by optimization goal and campaign objective. See Objective, Optimization Goal and attribution_spec.',
    'type': DATA_TYPES.ARRAY
  },
  'bid_adjustments': {
    'description': 'Map of bid adjustment types to values',
    'type': DATA_TYPES.OBJECT
  },
  'bid_amount': {
    'description': 'Bid cap or target cost for this ad set. The bid cap used in a lowest cost bid strategy is defined as the maximum bid you want to pay for a result based on your optimization_goal. The target cost used in a target cost bid strategy lets Facebook bid on your behalf to meet your target on average and keep costs stable as you raise budget.',
    'type': DATA_TYPES.INTEGER
  },
  'bid_constraints': {
    'description': 'Choose bid constraints for ad set to suit your specific business goals. It usually works together with bid_strategy field.',
    'type': DATA_TYPES.OBJECT
  },
  'bid_info': {
    'description': 'Map of bid objective to bid value.',
    'type': DATA_TYPES.OBJECT
  },
  'bid_strategy': {
    'description': 'Bid strategy for this ad set when you use AUCTION as your buying type:',
    'type': DATA_TYPES.STRING
  },
  'billing_event': {
    'description': 'The billing event for this ad set:',
    'type': DATA_TYPES.STRING
  },
  'brand_safety_config': {
    'description': 'brand_safety_config',
    'type': DATA_TYPES.OBJECT
  },
  'budget_remaining': {
    'description': 'Remaining budget of this Ad Set',
    'type': DATA_TYPES.STRING
  },
  'campaign': {
    'description': 'The campaign that contains this ad set',
    'type': DATA_TYPES.OBJECT
  },
  'campaign_active_time': {
    'description': 'Campaign running length',
    'type': DATA_TYPES.STRING
  },
  'campaign_attribution': {
    'description': 'campaign_attribution, a new field for app ads campaign, used to indicate a campaign\'s attribution type, eg: SKAN or AEM',
    'type': DATA_TYPES.STRING
  },
  'campaign_id': {
    'description': 'The ID of the campaign that contains this ad set',
    'type': DATA_TYPES.STRING
  },
  'configured_status': {
    'description': 'The status set at the ad set level. It can be different from the effective status due to its parent campaign. Prefer using \'status\' instead of this.',
    'type': DATA_TYPES.STRING
  },
  'contextual_bundling_spec': {
    'description': 'specs of contextual bundling Ad Set setup, including signal of opt-in/out the feature',
    'type': DATA_TYPES.OBJECT
  },
  'created_time': {
    'description': 'Time when this Ad Set was created',
    'type': DATA_TYPES.DATETIME
  },
  'creative_sequence': {
    'description': 'Order of the adgroup sequence to be shown to users',
    'type': DATA_TYPES.ARRAY
  },
  'daily_budget': {
    'description': 'The daily budget of the set defined in your account currency.',
    'type': DATA_TYPES.STRING
  },
  'daily_min_spend_target': {
    'description': 'Daily minimum spend target of the ad set defined in your account currency. To use this field, daily budget must be specified in the Campaign. This target is not a guarantee but our best effort.',
    'type': DATA_TYPES.STRING
  },
  'daily_spend_cap': {
    'description': 'Daily spend cap of the ad set defined in your account currency. To use this field, daily budget must be specified in the Campaign.',
    'type': DATA_TYPES.STRING
  },
  'destination_type': {
    'description': 'Destination of ads in this Ad Set.',
    'type': DATA_TYPES.STRING
  },
  'dsa_beneficiary': {
    'description': 'The beneficiary of all ads in this ad set.',
    'type': DATA_TYPES.STRING
  },
  'dsa_payor': {
    'description': 'The payor of all ads in this ad set.',
    'type': DATA_TYPES.STRING
  },
  'effective_status': {
    'description': 'The effective status of the adset. The status could be effective either because of its own status, or the status of its parent campaign. WITH_ISSUES is available for version 3.2 or higher. IN_PROCESS is available for version 4.0 or higher.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, CAMPAIGN_PAUSED, ARCHIVED, IN_PROCESS, WITH_ISSUES}'
  },
  'end_time': {
    'description': 'End time, in UTC UNIX timestamp',
    'type': DATA_TYPES.DATETIME
  },
  'frequency_control_specs': {
    'description': 'An array of frequency control specs for this ad set. As there is only one event type currently supported, this array has no more than one element. Writes to this field are only available in ad sets where REACH is the objective.',
    'type': DATA_TYPES.ARRAY
  },
  'instagram_actor_id': {
    'description': 'Represents your Instagram account id, used for ads, including dynamic creative ads on Instagram.',
    'type': DATA_TYPES.STRING
  },
  'is_dynamic_creative': {
    'description': 'Whether this ad set is a dynamic creative ad set. dynamic creative ad can be created only under ad set with this field set to be true.',
    'type': DATA_TYPES.BOOLEAN
  },
  'issues_info': {
    'description': 'Issues for this ad set that prevented it from deliverying',
    'type': DATA_TYPES.ARRAY
  },
  'learning_stage_info': {
    'description': 'Info about whether the ranking or delivery system is still learning for this ad set. While the ad set is still in learning , we might unstablized delivery performances.',
    'type': DATA_TYPES.OBJECT
  },
  'lifetime_budget': {
    'description': 'The lifetime budget of the set defined in your account currency.',
    'type': DATA_TYPES.STRING
  },
  'lifetime_imps': {
    'description': 'Lifetime impressions. Available only for campaigns with buying_type=FIXED_CPM',
    'type': DATA_TYPES.INTEGER
  },
  'lifetime_min_spend_target': {
    'description': 'Lifetime minimum spend target of the ad set defined in your account currency. To use this field, lifetime budget must be specified in the Campaign. This target is not a guarantee but our best effort.',
    'type': DATA_TYPES.STRING
  },
  'lifetime_spend_cap': {
    'description': 'Lifetime spend cap of the ad set defined in your account currency. To use this field, lifetime budget must be specified in the Campaign.',
    'type': DATA_TYPES.STRING
  },
  'min_budget_spend_percentage': {
    'description': 'min_budget_spend_percentage',
    'type': DATA_TYPES.STRING
  },
  'multi_optimization_goal_weight': {
    'description': 'multi_optimization_goal_weight',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'Name of the ad set',
    'type': DATA_TYPES.STRING
  },
  'optimization_goal': {
    'description': 'The optimization goal this ad set is using.',
    'type': DATA_TYPES.STRING
  },
  'optimization_sub_event': {
    'description': 'Optimization sub event for a specific optimization goal. For example: Sound-On event for Video-View-2s optimization goal.',
    'type': DATA_TYPES.STRING
  },
  'pacing_type': {
    'description': 'Defines the pacing type, standard or using ad scheduling',
    'type': DATA_TYPES.ARRAY
  },
  'promoted_object': {
    'description': 'The object this ad set is promoting across all its ads.',
    'type': DATA_TYPES.OBJECT
  },
  'recommendations': {
    'description': 'If there are recommendations for this ad set, this field includes them. Otherwise, will not be included in the response. This field is not included in redownload mode.',
    'type': DATA_TYPES.ARRAY
  },
  'recurring_budget_semantics': {
    'description': 'If this field is true, your daily spend may be more than your daily budget while your weekly spend will not exceed 7 times your daily budget. More details explained in the Ad Set Budget document. If this is false, your amount spent daily will not exceed the daily budget. This field is not applicable for lifetime budgets.',
    'type': DATA_TYPES.BOOLEAN
  },
  'regional_regulated_categories': {
    'description': 'This param is used to specify regional_regulated_categories. Currently it supports null and three values:',
    'type': DATA_TYPES.ARRAY
  },
  'regional_regulation_identities': {
    'description': 'This param is used to specify regional_regulation_identities used to represent the ad set. Currently it supports 6 fields:',
    'type': DATA_TYPES.OBJECT
  },
  'review_feedback': {
    'description': 'Reviews for dynamic creative ad',
    'type': DATA_TYPES.STRING
  },
  'rf_prediction_id': {
    'description': 'Reach and frequency prediction ID',
    'type': DATA_TYPES.STRING
  },
  'source_adset': {
    'description': 'The source ad set that this ad set was copied from',
    'type': DATA_TYPES.OBJECT
  },
  'source_adset_id': {
    'description': 'The source ad set id that this ad set was copied from',
    'type': DATA_TYPES.STRING
  },
  'start_time': {
    'description': 'Start time, in UTC UNIX timestamp',
    'type': DATA_TYPES.DATETIME
  },
  'status': {
    'description': 'The status set at the ad set level. It can be different from the effective status due to its parent campaign. The field returns the same value as configured_status, and is the suggested one to use.',
    'type': DATA_TYPES.STRING
  },
  'targeting': {
    'description': 'Targeting',
    'type': DATA_TYPES.OBJECT
  },
  'targeting_optimization_types': {
    'description': 'Targeting options that are relaxed and used as a signal for optimization',
    'type': DATA_TYPES.ARRAY
  },
  'time_based_ad_rotation_id_blocks': {
    'description': 'Specify ad creative that displays at custom date ranges in a campaign as an array. A list of Adgroup IDs. The list of ads to display for each time range in a given schedule. For example display first ad in Adgroup for first date range, second ad for second date range, and so on. You can display more than one ad per date range by providing more than one ad ID per array. For example set time_based_ad_rotation_id_blocks to [[1], [2, 3], [1, 4]]. On the first date range show ad 1, on the second date range show ad 2 and ad 3 and on the last date range show ad 1 and ad 4. Use with time_based_ad_rotation_intervals to specify date ranges.',
    'type': DATA_TYPES.ARRAY
  },
  'time_based_ad_rotation_intervals': {
    'description': 'Date range when specific ad creative displays during a campaign. Provide date ranges in an array of UNIX timestamps where each timestamp represents the start time for each date range. For example a 3-day campaign from May 9 12am to May 11 11:59PM PST can have three date ranges, the first date range starts from May 9 12:00AM to May 9 11:59PM, second date range starts from May 10 12:00AM to May 10 11:59PM and last starts from May 11 12:00AM to May 11 11:59PM. The first timestamp should match the campaign start time. The last timestamp should be at least 1 hour before the campaign end time. You must provide at least two date ranges. All date ranges must cover the whole campaign length, so any date range cannot exceed campaign length. Use with time_based_ad_rotation_id_blocks to specify ad creative for each date range.',
    'type': DATA_TYPES.ARRAY
  },
  'updated_time': {
    'description': 'Time when the Ad Set was updated',
    'type': DATA_TYPES.DATETIME
  },
  'use_new_app_click': {
    'description': 'If set, allows Mobile App Engagement ads to optimize for LINK_CLICKS',
    'type': DATA_TYPES.BOOLEAN
  }
  
}  