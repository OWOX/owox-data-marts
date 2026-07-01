/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInPagesFieldsSchema = {
  "follower_statistics": {
    "overview": "LinkedIn Follower Statistics",
    "description": "Lifetime follower counts broken down by segment — seniority, industry, function, geography, and association type.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics",
    "fields": followerStatisticsFields,
    "uniqueKeys": ["organization_urn", "category_type", "segment_name", "segment_value"],
    "defaultFields": ["organization_urn", "category_type", "segment_name", "segment_value", "organic_follower_count", "paid_follower_count"],
    "destinationName": "linkedin_pages_follower_statistics",
    "isTimeSeries": false
  },
  "follower_statistics_time_bound": {
    "overview": "LinkedIn Time-Bound Follower Statistics",
    "description": "Daily follower gains broken down by organic and paid — tracks how your audience grows over time.",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics",
    "fields": followerStatisticsTimeBoundFields,
    "uniqueKeys": ["organization_urn", "time_range_start", "time_range_end"],
    "defaultFields": ["organization_urn", "time_range_start", "time_range_end", "organic_follower_gain", "paid_follower_gain"],
    "destinationName": "linkedin_pages_follower_statistics_time_bound",
    "isTimeSeries": true
  }
};
