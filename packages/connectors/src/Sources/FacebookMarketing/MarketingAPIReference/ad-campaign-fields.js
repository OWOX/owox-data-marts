/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCampaignFields = {
  'id': {
    'description': 'ID for the Ad Set',
    'type': 'numeric string'
  },
  'account_id': {
    'description': 'ID for the Ad Account associated with this Ad Set',
    'type': 'numeric string'
  },
  'adlabels': {
    'description': 'Ad Labels associated with this ad set',
    'type': 'list<AdLabel>'
  },
  'adset_schedule': {
    'description': 'Ad set schedule, representing a delivery schedule for a single day',
    'type': 'list<DayPart>'
  },
  'asset_feed_id': {
    'description': 'The ID of the asset feed that constains a content to create ads',
    'type': 'numeric string'
  },
  'attribution_spec': {
    'description': 'Conversion attribution spec used for attributing conversions for optimization. Supported window lengths differ by optimization goal and campaign objective. See Objective, Optimization Goal and attribution_spec.',
    'type': 'list<AttributionSpec>'
  },
  'bid_adjustments': {
    'description': 'Map of bid adjustment types to values',
    'type': 'AdBidAdjustments'
  },
  'bid_amount': {
    'description': 'Bid cap or target cost for this ad set. The bid cap used in a lowest cost bid strategy is defined as the maximum bid you want to pay for a result based on your optimization_goal. The target cost used in a target cost bid strategy lets Facebook bid on your behalf to meet your target on average and keep costs stable as you raise budget.',
    'type': 'unsigned int32'
  },
  'bid_constraints': {
    'description': 'Choose bid constraints for ad set to suit your specific business goals. It usually works together with bid_strategy field.',
    'type': 'AdCampaignBidConstraint'
  },
  'bid_info': {
    'description': 'Map of bid objective to bid value.',
    'type': 'map<string, unsigned int32>'
  },
  'bid_strategy': {
    'description': 'Bid strategy for this ad set when you use AUCTION as your buying type:',
    'type': 'enum {LOWEST_COST_WITHOUT_CAP, LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS}'
  },
  'billing_event': {
    'description': 'The billing event for this ad set:',
    'type': 'enum {APP_INSTALLS, CLICKS, IMPRESSIONS, LINK_CLICKS, NONE, OFFER_CLAIMS, PAGE_LIKES, POST_ENGAGEMENT, THRUPLAY, PURCHASE, LISTING_INTERACTION}'
  },
  'brand_safety_config': {
    'description': 'brand_safety_config',
    'type': 'BrandSafetyCampaignConfig'
  },
  'budget_remaining': {
    'description': 'Remaining budget of this Ad Set',
    'type': 'numeric string'
  },
  'campaign': {
    'description': 'The campaign that contains this ad set',
    'type': 'Campaign'
  },
  'campaign_active_time': {
    'description': 'Campaign running length',
    'type': 'numeric string'
  },
  'campaign_attribution': {
    'description': 'campaign_attribution, a new field for app ads campaign, used to indicate a campaign\'s attribution type, eg: SKAN or AEM',
    'type': 'enum'
  },
  'campaign_id': {
    'description': 'The ID of the campaign that contains this ad set',
    'type': 'numeric string'
  },
  'configured_status': {
    'description': 'The status set at the ad set level. It can be different from the effective status due to its parent campaign. Prefer using \'status\' instead of this.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, ARCHIVED}'
  },
  'contextual_bundling_spec': {
    'description': 'specs of contextual bundling Ad Set setup, including signal of opt-in/out the feature',
    'type': 'ContextualBundlingSpec'
  },
  'created_time': {
    'description': 'Time when this Ad Set was created',
    'type': 'datetime'
  },
  'creative_sequence': {
    'description': 'Order of the adgroup sequence to be shown to users',
    'type': 'list<numeric string>'
  },
  'daily_budget': {
    'description': 'The daily budget of the set defined in your account currency.',
    'type': 'numeric string'
  },
  'daily_min_spend_target': {
    'description': 'Daily minimum spend target of the ad set defined in your account currency. To use this field, daily budget must be specified in the Campaign. This target is not a guarantee but our best effort.',
    'type': 'numeric string'
  },
  'daily_spend_cap': {
    'description': 'Daily spend cap of the ad set defined in your account currency. To use this field, daily budget must be specified in the Campaign.',
    'type': 'numeric string'
  },
  'destination_type': {
    'description': 'Destination of ads in this Ad Set.',
    'type': 'string'
  },
  'dsa_beneficiary': {
    'description': 'The beneficiary of all ads in this ad set.',
    'type': 'string'
  },
  'dsa_payor': {
    'description': 'The payor of all ads in this ad set.',
    'type': 'string'
  },
  'effective_status': {
    'description': 'The effective status of the adset. The status could be effective either because of its own status, or the status of its parent campaign. WITH_ISSUES is available for version 3.2 or higher. IN_PROCESS is available for version 4.0 or higher.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, CAMPAIGN_PAUSED, ARCHIVED, IN_PROCESS, WITH_ISSUES}'
  },
  'end_time': {
    'description': 'End time, in UTC UNIX timestamp',
    'type': 'datetime'
  },
  'frequency_control_specs': {
    'description': 'An array of frequency control specs for this ad set. As there is only one event type currently supported, this array has no more than one element. Writes to this field are only available in ad sets where REACH is the objective.',
    'type': 'list<AdCampaignFrequencyControlSpecs>'
  },
  'instagram_actor_id': {
    'description': 'Represents your Instagram account id, used for ads, including dynamic creative ads on Instagram.',
    'type': 'numeric string'
  },
  'is_dynamic_creative': {
    'description': 'Whether this ad set is a dynamic creative ad set. dynamic creative ad can be created only under ad set with this field set to be true.',
    'type': 'bool'
  },
  'issues_info': {
    'description': 'Issues for this ad set that prevented it from deliverying',
    'type': 'list<AdCampaignIssuesInfo>'
  },
  'learning_stage_info': {
    'description': 'Info about whether the ranking or delivery system is still learning for this ad set. While the ad set is still in learning , we might unstablized delivery performances.',
    'type': 'AdCampaignLearningStageInfo'
  },
  'lifetime_budget': {
    'description': 'The lifetime budget of the set defined in your account currency.',
    'type': 'numeric string'
  },
  'lifetime_imps': {
    'description': 'Lifetime impressions. Available only for campaigns with buying_type=FIXED_CPM',
    'type': 'int32'
  },
  'lifetime_min_spend_target': {
    'description': 'Lifetime minimum spend target of the ad set defined in your account currency. To use this field, lifetime budget must be specified in the Campaign. This target is not a guarantee but our best effort.',
    'type': 'numeric string'
  },
  'lifetime_spend_cap': {
    'description': 'Lifetime spend cap of the ad set defined in your account currency. To use this field, lifetime budget must be specified in the Campaign.',
    'type': 'numeric string'
  },
  'min_budget_spend_percentage': {
    'description': 'min_budget_spend_percentage',
    'type': 'numeric string'
  },
  'multi_optimization_goal_weight': {
    'description': 'multi_optimization_goal_weight',
    'type': 'string'
  },
  'name': {
    'description': 'Name of the ad set',
    'type': 'string'
  },
  'optimization_goal': {
    'description': 'The optimization goal this ad set is using.',
    'type': 'enum {NONE, APP_INSTALLS, AD_RECALL_LIFT, ENGAGED_USERS, EVENT_RESPONSES, IMPRESSIONS, LEAD_GENERATION, QUALITY_LEAD, LINK_CLICKS, OFFSITE_CONVERSIONS, PAGE_LIKES, POST_ENGAGEMENT, QUALITY_CALL, REACH, LANDING_PAGE_VIEWS, VISIT_INSTAGRAM_PROFILE, VALUE, THRUPLAY, DERIVED_EVENTS, APP_INSTALLS_AND_OFFSITE_CONVERSIONS, CONVERSATIONS, IN_APP_VALUE, MESSAGING_PURCHASE_CONVERSION, SUBSCRIBERS, REMINDERS_SET, MEANINGFUL_CALL_ATTEMPT, PROFILE_VISIT, MESSAGING_APPOINTMENT_CONVERSION}'
  },
  'optimization_sub_event': {
    'description': 'Optimization sub event for a specific optimization goal. For example: Sound-On event for Video-View-2s optimization goal.',
    'type': 'string'
  },
  'pacing_type': {
    'description': 'Defines the pacing type, standard or using ad scheduling',
    'type': 'list<string>'
  },
  'promoted_object': {
    'description': 'The object this ad set is promoting across all its ads.',
    'type': 'AdPromotedObject'
  },
  'recommendations': {
    'description': 'If there are recommendations for this ad set, this field includes them. Otherwise, will not be included in the response. This field is not included in redownload mode.',
    'type': 'list<AdRecommendation>'
  },
  'recurring_budget_semantics': {
    'description': 'If this field is true, your daily spend may be more than your daily budget while your weekly spend will not exceed 7 times your daily budget. More details explained in the Ad Set Budget document. If this is false, your amount spent daily will not exceed the daily budget. This field is not applicable for lifetime budgets.',
    'type': 'bool'
  },
  'regional_regulated_categories': {
    'description': 'This param is used to specify regional_regulated_categories. Currently it supports null and three values:',
    'type': 'list<enum>'
  },
  'regional_regulation_identities': {
    'description': 'This param is used to specify regional_regulation_identities used to represent the ad set. Currently it supports 6 fields:',
    'type': 'RegionalRegulationIdentities'
  },
  'review_feedback': {
    'description': 'Reviews for dynamic creative ad',
    'type': 'string'
  },
  'rf_prediction_id': {
    'description': 'Reach and frequency prediction ID',
    'type': 'id'
  },
  'source_adset': {
    'description': 'The source ad set that this ad set was copied from',
    'type': 'AdSet'
  },
  'source_adset_id': {
    'description': 'The source ad set id that this ad set was copied from',
    'type': 'numeric string'
  },
  'start_time': {
    'description': 'Start time, in UTC UNIX timestamp',
    'type': 'datetime'
  },
  'status': {
    'description': 'The status set at the ad set level. It can be different from the effective status due to its parent campaign. The field returns the same value as configured_status, and is the suggested one to use.',
    'type': 'enum {ACTIVE, PAUSED, DELETED, ARCHIVED}'
  },
  'targeting': {
    'description': 'Targeting',
    'type': 'Targeting'
  },
  'targeting_optimization_types': {
    'description': 'Targeting options that are relaxed and used as a signal for optimization',
    'type': 'list<KeyValue:string,int32>'
  },
  'time_based_ad_rotation_id_blocks': {
    'description': 'Specify ad creative that displays at custom date ranges in a campaign as an array. A list of Adgroup IDs. The list of ads to display for each time range in a given schedule. For example display first ad in Adgroup for first date range, second ad for second date range, and so on. You can display more than one ad per date range by providing more than one ad ID per array. For example set time_based_ad_rotation_id_blocks to [[1], [2, 3], [1, 4]]. On the first date range show ad 1, on the second date range show ad 2 and ad 3 and on the last date range show ad 1 and ad 4. Use with time_based_ad_rotation_intervals to specify date ranges.',
    'type': 'list<list<integer>>'
  },
  'time_based_ad_rotation_intervals': {
    'description': 'Date range when specific ad creative displays during a campaign. Provide date ranges in an array of UNIX timestamps where each timestamp represents the start time for each date range. For example a 3-day campaign from May 9 12am to May 11 11:59PM PST can have three date ranges, the first date range starts from May 9 12:00AM to May 9 11:59PM, second date range starts from May 10 12:00AM to May 10 11:59PM and last starts from May 11 12:00AM to May 11 11:59PM. The first timestamp should match the campaign start time. The last timestamp should be at least 1 hour before the campaign end time. You must provide at least two date ranges. All date ranges must cover the whole campaign length, so any date range cannot exceed campaign length. Use with time_based_ad_rotation_id_blocks to specify ad creative for each date range.',
    'type': 'list<unsigned int32>'
  },
  'updated_time': {
    'description': 'Time when the Ad Set was updated',
    'type': 'datetime'
  },
  'use_new_app_click': {
    'description': 'If set, allows Mobile App Engagement ads to optimize for LINK_CLICKS',
    'type': 'bool'
  }
  
}  