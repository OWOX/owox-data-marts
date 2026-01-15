/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var statsFields = {
  'id': {
    'description': 'The unique identifier for the stats record.',
    'type': DATA_TYPES.STRING
  },
  'date': {
    'description': 'The date for which the statistics were collected.',
    'type': DATA_TYPES.STRING,
  },
  'placement': {
    'description': 'The placement type (ALL_ON_TWITTER or PUBLISHER_NETWORK).',
    'type': DATA_TYPES.STRING
  },
  'impressions': {
    'description': 'Number of impressions.',
    'type': DATA_TYPES.INTEGER
  },
  'tweets_send': {
    'description': 'Number of tweets sent.',
    'type': DATA_TYPES.INTEGER
  },
  'billed_charge_local_micro': {
    'description': 'Billed amount in micros.',
    'type': DATA_TYPES.INTEGER
  },
  'qualified_impressions': {
    'description': 'Number of qualified impressions.',
    'type': DATA_TYPES.INTEGER
  },
  'follows': {
    'description': 'Number of follows.',
    'type': DATA_TYPES.INTEGER
  },
  'app_clicks': {
    'description': 'Number of app clicks.',
    'type': DATA_TYPES.INTEGER
  },
  'retweets': {
    'description': 'Number of retweets.',
    'type': DATA_TYPES.INTEGER
  },
  'unfollows': {
    'description': 'Number of unfollows.',
    'type': DATA_TYPES.INTEGER
  },
  'likes': {
    'description': 'Number of likes.',
    'type': DATA_TYPES.INTEGER
  },
  'engagements': {
    'description': 'Number of engagements.',
    'type': DATA_TYPES.INTEGER
  },
  'clicks': {
    'description': 'Number of clicks.',
    'type': DATA_TYPES.INTEGER
  },
  'card_engagements': {
    'description': 'Number of card engagements.',
    'type': DATA_TYPES.INTEGER
  },
  'poll_card_vote': {
    'description': 'Number of poll card votes.',
    'type': DATA_TYPES.INTEGER
  },
  'replies': {
    'description': 'Number of replies.',
    'type': DATA_TYPES.INTEGER
  },
  'url_clicks': {
    'description': 'Number of URL clicks.',
    'type': DATA_TYPES.INTEGER
  },
  'billed_engagements': {
    'description': 'Number of billed engagements.',
    'type': DATA_TYPES.INTEGER
  },
  'carousel_swipes': {
    'description': 'Number of carousel swipes.',
    'type': DATA_TYPES.INTEGER
  }
};
