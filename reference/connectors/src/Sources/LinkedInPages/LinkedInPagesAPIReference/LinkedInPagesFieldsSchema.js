/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInPagesFieldsSchema = {
  "follower_statistics": {
    "overview": "LinkedIn Follower Statistics",
    "description": "Lifetime follower statistics for a LinkedIn Organization Page",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics",
    "fields": followerStatisticsFields,
    "uniqueKeys": ["organization_urn", "category_type", "segment_name", "segment_value"],
    "destinationName": "linkedin_pages_follower_statistics",
    "isTimeSeries": false
  },
  "follower_statistics_time_bound": {
    "overview": "LinkedIn Time-Bound Follower Statistics",
    "description": "Time-bound follower statistics for a LinkedIn Organization Page",
    "documentation": "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics",
    "fields": followerStatisticsTimeBoundFields,
    "uniqueKeys": ["organization_urn", "time_range_start", "time_range_end"],
    "destinationName": "linkedin_pages_follower_statistics_time_bound",
    "isTimeSeries": true
  }
};
