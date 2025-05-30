/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var followerStatisticsTimeBoundFields = {
  'organization_urn': {
    'description': 'Organization URN',
    'type': 'string'
  },
  'time_range_start': {
    'description': 'Start timestamp of the time range',
    'type': 'timestamp'
  },
  'time_range_end': {
    'description': 'End timestamp of the time range',
    'type': 'timestamp'
  },
  'organic_follower_gain': {
    'description': 'Number of organic followers gained during the time period',
    'type': 'integer'
  },
  'paid_follower_gain': {
    'description': 'Number of paid followers gained during the time period',
    'type': 'integer'
  },
  'follower_counts_by_association_type': {
    'description': 'Followers segmented by association type (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_seniority': {
    'description': 'Followers segmented by seniority (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_industry': {
    'description': 'Followers segmented by industry (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_function': {
    'description': 'Followers segmented by function (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_staff_count_range': {
    'description': 'Followers segmented by staff count range (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_geo_country': {
    'description': 'Followers segmented by country (empty in time-bound responses)',
    'type': 'record'
  },
  'follower_counts_by_geo': {
    'description': 'Followers segmented by geographic area (empty in time-bound responses)',
    'type': 'record'
  }
};
