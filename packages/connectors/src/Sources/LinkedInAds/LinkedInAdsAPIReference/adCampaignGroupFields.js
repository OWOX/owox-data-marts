/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var adCampaignGroupFields = {
  'account': {
    'description': 'URN identifying the advertising account associated with the campaign. This value is immutable once set. For example, urn:li:SponsoredAccount:{id}.',
    'type': 'string'
  },
  'accountInfo': {
    'description': 'Information about the advertising account associated with the campaign. This is a read only field. Please refer to Additional Info Fields to learn how to access this field.',
    'type': 'object'
  },
  'backfilled': {
    'description': 'Flag that denotes whether the campaign group was created organically or to backfill existing campaigns. This is a read-only field set by the system.',
    'type': 'boolean'
  },
  'id': {
    'description': 'Numerical identifier for the campaign group. This is a read-only field set by the system.',
    'type': 'number'
  },
  'name': {
    'description': 'The name of the campaign group used to make it easier to reference a campaign group and recall its purpose. The value of this field cannot exceed 100 characters.',
    'type': 'string'
  },
  'runSchedule': {
    'description': 'Scheduled date range to run associated campaigns under this campaign group. The start date must be non-null. Represents the inclusive (greater than or equal to) value in which to start the range. The end date is optional and if unset, it indicates an open range with no end date. This field is required if totalBudget is set.',
    'type': 'object'
  },
  'servingStatuses': {
    'description': 'Array of enums that determine whether or not campaigns within the campaign group may be served. Unlike status, which is user-managed, the values are controlled by the service. This is a read-only field. Possible values are:RUNNABLE Campaign group is currently active; billing information, budgetary constraints, or start and end dates are valid.',
    'type': 'string[]'
  },
  'status': {
    'description': 'Status of campaign group. Possible values are:ACTIVE - Denotes that the campaign group is capable of serving ads, subject to run date and budget limitations (as well as any other limitations at the account or campaign level).',
    'type': 'string'
  },
  'totalBudget': {
    'description': 'If budgetOptimization.budgetOptimizationStrategy is DYNAMIC, the total budget of the campaign group will be shared among all campaigns within the same campaign group. Otherwise, it represents the maximum amount to be spent over the life of the campaign group. The amount of money as a real number string. The currency must match the ISO currency code of the account.',
    'type': 'object'
  },
  'test': {
    'description': 'Flag showing whether this campaign group is a test campaign group, i.e., belongs to a test account. This is a read-only and immutable field that is set implicitly during creation based on whether the account is a Test Account or not.',
    'type': 'boolean'
  },
  'allowedCampaignTypes': {
    'description': 'Array of enums that indicates allowed campaign types within the specific campaign group. Possible values are:TEXT_AD - Text-based ads that show up in the right column or top of the page on LinkedIn.',
    'type': 'string[]'
  },
  'objectiveType': {
    'description': 'Campaign Group Objective type values. This field is optional and immutable. Campaigns in this group will automatically have the same objective type. Click here for Objective descriptionsBRAND_AWARENESS',
    'type': 'string'
  },
  'budgetOptimization': {
    'description': 'Denotes the strategy used for bidding in auction and budget optimization across campaigns under the campaign group. Campaigns under the campaign group must have the same bid strategy. Possible values for bidStrategy: MAXIMUM_DELIVERY. Possible values for budgetOptimizationStrategy: DYNAMIC.',
    'type': 'object'
  },
  'dailyBudget': {
    'description': 'Daily budget for the campaign group and will be shared among all campaigns within the campaign group. This field is optional and mutable. It can only be used if budgetOptimization.budgetOptimizationStrategy is DYNAMIC Note: This field applies to API Versions starting from 202504 and later.',
    'type': 'number',
    'GoogleBigQueryType': 'numeric'
  }
} 