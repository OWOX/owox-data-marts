/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var tweetFields = {
  'coordinates': {
    'description': 'The geographic coordinates (latitude/longitude) of the tweet, if available.',
    'type': 'object'
  },
  'retweeted': {
    'description': 'Whether this tweet is a retweet of another tweet.',
    'type': 'boolean'
  },
  'name': {
    'description': 'A custom name or label for the tweet.',
    'type': 'string'
  },
  'conversation_settings': {
    'description': 'Who can reply or interact with the tweet (e.g. EVERYONE).',
    'type': 'string'
  },
  'source': {
    'description': 'HTML markup indicating the client or interface used to post the tweet.',
    'type': 'string'
  },
  'entities': {
    'description': 'Parsed entities in the tweet (mentions, hashtags, URLs, media, etc.).',
    'type': 'object'
  },
  'display_text_range': {
    'description': 'Start/end indices for which portion of the tweet text to display.',
    'type': 'integer[2]'
  },
  'favorite_count': {
    'description': 'Number of times the tweet has been liked.',
    'type': 'integer'
  },
  'in_reply_to_status_id_str': {
    'description': 'ID (as string) of the tweet this one is replying to.',
    'type': 'string'
  },
  'geo': {
    'description': 'Deprecated geographic information, if present.',
    'type': 'object'
  },
  'id_str': {
    'description': 'The tweet’s unique identifier, as a string.',
    'type': 'string'
  },
  'scopes': {
    'description': 'Visibility scopes (e.g. { followers: false }).',
    'type': 'object'
  },
  'in_reply_to_user_id': {
    'description': 'Numeric ID of the user this tweet is replying to.',
    'type': 'integer',
    'GoogleSheetsFormat': '@'
  },
  'truncated': {
    'description': 'Whether the tweet text has been truncated.',
    'type': 'boolean'
  },
  'retweet_count': {
    'description': 'Number of times this tweet has been retweeted.',
    'type': 'integer'
  },
  'scheduled_status': {
    'description': 'Scheduled status (e.g. pending scheduling), if any.',
    'type': 'string'
  },
  'id': {
    'description': 'The tweet’s unique identifier, as a number.',
    'type': 'integer'
  },
  'in_reply_to_status_id': {
    'description': 'Numeric ID of the tweet this one is replying to.',
    'type': 'integer or null',
    'GoogleSheetsFormat': '@'
  },
  'possibly_sensitive': {
    'description': 'Whether the tweet may contain sensitive content.',
    'type': 'boolean'
  },
  'nullcast': {
    'description': 'Whether the tweet is nullcast (not shown on timeline).',
    'type': 'boolean'
  },
  'created_at': {
    'description': 'Creation timestamp of the tweet.',
    'type': 'string'
  },
  'place': {
    'description': 'Place (location) associated with the tweet, if any.',
    'type': 'object or null'
  },
  'scheduled_at': {
    'description': 'When the tweet was scheduled for posting.',
    'type': 'string or null'
  },
  'tweet_type': {
    'description': 'Type of tweet (e.g. PUBLISHED).',
    'type': 'string'
  },
  'favorited': {
    'description': 'Whether the authenticated user has liked the tweet.',
    'type': 'boolean'
  },
  'card_uri': {
    'description': 'URI of the associated Twitter Card.',
    'type': 'string'
  },
  'full_text': {
    'description': 'The full text content of the tweet.',
    'type': 'string'
  },
  'lang': {
    'description': 'Language code of the tweet (e.g. en).',
    'type': 'string'
  },
  'contributors': {
    'description': 'Array of contributors to the tweet, if any.',
    'type': 'array or null'
  },
  'in_reply_to_screen_name': {
    'description': 'Screen name of the user this tweet is replying to.',
    'type': 'string or null'
  },
  'in_reply_to_user_id_str': {
    'description': 'ID (as string) of the user this tweet is replying to.',
    'type': 'string or null'
  },
  'user': {
    'description': 'The user object of the author (contains id, id_str, etc.).',
    'type': 'object'
  },
  'tweet_id': {
    'description': 'Duplicate of id_str (the tweet’s ID as a string).',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'extended_entities': {
    'description': 'Extended media entities (e.g. video variants, additional media info).',
    'type': 'object'
  }
};
