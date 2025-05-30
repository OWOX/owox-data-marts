/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var statsFields = {
  'id': {
    'description': 'The unique identifier for the stats record.',
    'type': 'string'
  },
  'date': {
    'description': 'The date for which the statistics were collected.',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'placement': {
    'description': 'The placement type (ALL_ON_TWITTER or PUBLISHER_NETWORK).',
    'type': 'string'
  },
  'impressions': {
    'description': 'Number of impressions.',
    'type': 'integer'
  },
  'tweets_send': {
    'description': 'Number of tweets sent.',
    'type': 'integer'
  },
  'billed_charge_local_micro': {
    'description': 'Billed amount in micros.',
    'type': 'integer'
  },
  'qualified_impressions': {
    'description': 'Number of qualified impressions.',
    'type': 'integer'
  },
  'follows': {
    'description': 'Number of follows.',
    'type': 'integer'
  },
  'app_clicks': {
    'description': 'Number of app clicks.',
    'type': 'integer'
  },
  'retweets': {
    'description': 'Number of retweets.',
    'type': 'integer'
  },
  'unfollows': {
    'description': 'Number of unfollows.',
    'type': 'integer'
  },
  'likes': {
    'description': 'Number of likes.',
    'type': 'integer'
  },
  'engagements': {
    'description': 'Number of engagements.',
    'type': 'integer'
  },
  'clicks': {
    'description': 'Number of clicks.',
    'type': 'integer'
  },
  'card_engagements': {
    'description': 'Number of card engagements.',
    'type': 'integer'
  },
  'poll_card_vote': {
    'description': 'Number of poll card votes.',
    'type': 'integer'
  },
  'replies': {
    'description': 'Number of replies.',
    'type': 'integer'
  },
  'url_clicks': {
    'description': 'Number of URL clicks.',
    'type': 'integer'
  },
  'billed_engagements': {
    'description': 'Number of billed engagements.',
    'type': 'integer'
  },
  'carousel_swipes': {
    'description': 'Number of carousel swipes.',
    'type': 'integer'
  }
};
