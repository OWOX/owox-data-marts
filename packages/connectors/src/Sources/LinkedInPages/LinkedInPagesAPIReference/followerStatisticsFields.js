/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var followerStatisticsFields = {
  'organization_urn': {
    'description': 'Organization URN',
    'type': 'string'
  },
  'category_type': {
    'description': 'Type of follower category (followerCountsByAssociationType, followerCountsBySeniority, etc.)',
    'type': 'string'
  },
  'segment_name': {
    'description': 'Name of the segment identifier (associationType, seniority, industry, function, staffCountRange, geo)',
    'type': 'string'
  },
  'segment_value': {
    'description': 'Value of the segment identifier (e.g., urn:li:seniority:3, EMPLOYEE, etc.)',
    'type': 'string'
  },
  'organic_follower_count': {
    'description': 'Count of organic followers in this segment',
    'type': 'integer'
  },
  'paid_follower_count': {
    'description': 'Count of paid followers in this segment',
    'type': 'integer'
  }
};
