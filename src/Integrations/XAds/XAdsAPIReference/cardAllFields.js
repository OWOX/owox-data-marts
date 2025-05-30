/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var cardAllFields = {
  'id': {
    'description': 'The unique identifier for the card',
    'type': 'string'
  },
  'name': {
    'description': 'The name of the card',
    'type': 'string'
  },
  'card_type': {
    'description': 'Type of the card (e.g. IMAGE_APP_DOWNLOAD, VIDEO_WEBSITE)',
    'type': 'string'
  },
  'card_uri': {
    'description': 'URI of the card',
    'type': 'string'
  },
  'created_at': {
    'description': 'ISO-8601 timestamp when the card was created',
    'type': 'datetime'
  },
  'updated_at': {
    'description': 'ISO-8601 timestamp when the card was last updated',
    'type': 'datetime'
  },
  'deleted': {
    'description': 'Whether the card is deleted',
    'type': 'boolean'
  },
  'googleplay_app_id': {
    'description': 'Google Play application ID',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'country_code': {
    'description': 'Country code associated with the app or destination',
    'type': 'string'
  },
  'wide_app_image': {
    'description': 'URL to the wide-aspect-ratio image used by the app card',
    'type': 'string'
  },
  'image_display_width': {
    'description': 'Width (in pixels) of the primary image displayed with the card',
    'type': 'string'
  },
  'image_display_height': {
    'description': 'Height (in pixels) of the primary image displayed with the card',
    'type': 'string'
  },
  'app_cta': {
    'description': 'Call-to-action used on the app card (e.g. INSTALL, OPEN)',
    'type': 'string'
  },
  'title': {
    'description': 'Title shown on the card',
    'type': 'string'
  },
  'website_url': {
    'description': 'Canonical website URL',
    'type': 'string'
  },
  'website_dest_url': {
    'description': 'Destination URL used for clicks',
    'type': 'string'
  },
  'website_display_url': {
    'description': 'Display URL shown on the card',
    'type': 'string'
  },
  'website_shortened_url': {
    'description': 'Shortened (t.co) URL placed in the card',
    'type': 'string'
  },
  'video_url': {
    'description': 'URL of the video file or VMAP',
    'type': 'string'
  },
  'video_hls_url': {
    'description': 'HLS streaming URL',
    'type': 'string'
  },
  'video_poster_url': {
    'description': 'Poster image displayed before video playback',
    'type': 'string'
  },
  'video_content_id': {
    'description': 'Internal content identifier of the video',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'video_owner_id': {
    'description': 'User ID of the video owner',
    'type': 'string',
    'GoogleSheetsFormat': '@'
  },
  'content_duration_seconds': {
    'description': 'Video duration in seconds',
    'type': 'string'
  },
  'video_width': {
    'description': 'Original width of the video',
    'type': 'string'
  },
  'video_height': {
    'description': 'Original height of the video',
    'type': 'string'
  },
  'video_poster_width': {
    'description': 'Width of the video poster image',
    'type': 'string'
  },
  'video_poster_height': {
    'description': 'Height of the video poster image',
    'type': 'string'
  }
};
