/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var tweetFields = {
  'coordinates': {
    'description': 'The geographic coordinates (latitude/longitude) of the tweet, if available.',
    'type': DATA_TYPES.OBJECT
  },
  'retweeted': {
    'description': 'Whether this tweet is a retweet of another tweet.',
    'type': DATA_TYPES.BOOLEAN
  },
  'name': {
    'description': 'A custom name or label for the tweet.',
    'type': DATA_TYPES.STRING
  },
  'conversation_settings': {
    'description': 'Who can reply or interact with the tweet (e.g. EVERYONE).',
    'type': DATA_TYPES.STRING
  },
  'source': {
    'description': 'HTML markup indicating the client or interface used to post the tweet.',
    'type': DATA_TYPES.STRING
  },
  'entities': {
    'description': 'Parsed entities in the tweet (mentions, hashtags, URLs, media, etc.).',
    'type': DATA_TYPES.OBJECT
  },
  'display_text_range': {
    'description': 'Start/end indices for which portion of the tweet text to display.',
    'type': DATA_TYPES.ARRAY
  },
  'favorite_count': {
    'description': 'Number of times the tweet has been liked.',
    'type': DATA_TYPES.INTEGER
  },
  'in_reply_to_status_id_str': {
    'description': 'ID (as string) of the tweet this one is replying to.',
    'type': DATA_TYPES.STRING
  },
  'geo': {
    'description': 'Deprecated geographic information, if present.',
    'type': DATA_TYPES.OBJECT
  },
  'id_str': {
    'description': 'The tweet’s unique identifier, as a string.',
    'type': DATA_TYPES.STRING
  },
  'scopes': {
    'description': 'Visibility scopes (e.g. { followers: false }).',
    'type': DATA_TYPES.OBJECT
  },
  'in_reply_to_user_id': {
    'description': 'Numeric ID of the user this tweet is replying to.',
    'type': DATA_TYPES.INTEGER,
  },
  'truncated': {
    'description': 'Whether the tweet text has been truncated.',
    'type': DATA_TYPES.BOOLEAN
  },
  'retweet_count': {
    'description': 'Number of times this tweet has been retweeted.',
    'type': DATA_TYPES.INTEGER
  },
  'scheduled_status': {
    'description': 'Scheduled status (e.g. pending scheduling), if any.',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'The tweet’s unique identifier, as a number.',
    'type': DATA_TYPES.INTEGER
  },
  'in_reply_to_status_id': {
    'description': 'Numeric ID of the tweet this one is replying to.',
    'type': DATA_TYPES.INTEGER,
  },
  'possibly_sensitive': {
    'description': 'Whether the tweet may contain sensitive content.',
    'type': DATA_TYPES.BOOLEAN
  },
  'nullcast': {
    'description': 'Whether the tweet is nullcast (not shown on timeline).',
    'type': DATA_TYPES.BOOLEAN
  },
  'created_at': {
    'description': 'Creation timestamp of the tweet.',
    'type': DATA_TYPES.STRING
  },
  'place': {
    'description': 'Place (location) associated with the tweet, if any.',
    'type': DATA_TYPES.OBJECT
  },
  'scheduled_at': {
    'description': 'When the tweet was scheduled for posting.',
    'type': DATA_TYPES.STRING
  },
  'tweet_type': {
    'description': 'Type of tweet (e.g. PUBLISHED).',
    'type': DATA_TYPES.STRING
  },
  'favorited': {
    'description': 'Whether the authenticated user has liked the tweet.',
    'type': DATA_TYPES.BOOLEAN
  },
  'card_uri': {
    'description': 'URI of the associated Twitter Card.',
    'type': DATA_TYPES.STRING
  },
  'full_text': {
    'description': 'The full text content of the tweet.',
    'type': DATA_TYPES.STRING
  },
  'lang': {
    'description': 'Language code of the tweet (e.g. en).',
    'type': DATA_TYPES.STRING
  },
  'contributors': {
    'description': 'Array of contributors to the tweet, if any.',
    'type': DATA_TYPES.ARRAY
  },
  'in_reply_to_screen_name': {
    'description': 'Screen name of the user this tweet is replying to.',
    'type': DATA_TYPES.STRING
  },
  'in_reply_to_user_id_str': {
    'description': 'ID (as string) of the user this tweet is replying to.',
    'type': DATA_TYPES.STRING
  },
  'user': {
    'description': 'The user object of the author (contains id, id_str, etc.).',
    'type': DATA_TYPES.OBJECT
  },
  'tweet_id': {
    'description': 'Duplicate of id_str (the tweet’s ID as a string).',
    'type': DATA_TYPES.STRING,
  },
  'extended_entities': {
    'description': 'Extended media entities (e.g. video variants, additional media info).',
    'type': DATA_TYPES.OBJECT
  }
};
