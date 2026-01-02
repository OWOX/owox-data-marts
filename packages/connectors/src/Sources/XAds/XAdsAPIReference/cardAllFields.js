/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var cardAllFields = {
  'id': {
    'description': 'The unique identifier for the card',
    'type': DATA_TYPES.STRING
  },
  'name': {
    'description': 'The name of the card',
    'type': DATA_TYPES.STRING
  },
  'card_type': {
    'description': 'Type of the card (e.g. IMAGE_APP_DOWNLOAD, VIDEO_WEBSITE)',
    'type': DATA_TYPES.STRING
  },
  'card_uri': {
    'description': 'URI of the card',
    'type': DATA_TYPES.STRING
  },
  'created_at': {
    'description': 'ISO-8601 timestamp when the card was created',
    'type': DATA_TYPES.DATETIME
  },
  'updated_at': {
    'description': 'ISO-8601 timestamp when the card was last updated',
    'type': DATA_TYPES.DATETIME
  },
  'deleted': {
    'description': 'Whether the card is deleted',
    'type': DATA_TYPES.BOOLEAN
  },
  'googleplay_app_id': {
    'description': 'Google Play application ID',
    'type': DATA_TYPES.STRING,
  },
  'country_code': {
    'description': 'Country code associated with the app or destination',
    'type': DATA_TYPES.STRING
  },
  'wide_app_image': {
    'description': 'URL to the wide-aspect-ratio image used by the app card',
    'type': DATA_TYPES.STRING
  },
  'image_display_width': {
    'description': 'Width (in pixels) of the primary image displayed with the card',
    'type': DATA_TYPES.STRING
  },
  'image_display_height': {
    'description': 'Height (in pixels) of the primary image displayed with the card',
    'type': DATA_TYPES.STRING
  },
  'app_cta': {
    'description': 'Call-to-action used on the app card (e.g. INSTALL, OPEN)',
    'type': DATA_TYPES.STRING
  },
  'title': {
    'description': 'Title shown on the card',
    'type': DATA_TYPES.STRING
  },
  'website_url': {
    'description': 'Canonical website URL',
    'type': DATA_TYPES.STRING
  },
  'website_dest_url': {
    'description': 'Destination URL used for clicks',
    'type': DATA_TYPES.STRING
  },
  'website_display_url': {
    'description': 'Display URL shown on the card',
    'type': DATA_TYPES.STRING
  },
  'website_shortened_url': {
    'description': 'Shortened (t.co) URL placed in the card',
    'type': DATA_TYPES.STRING
  },
  'video_url': {
    'description': 'URL of the video file or VMAP',
    'type': DATA_TYPES.STRING
  },
  'video_hls_url': {
    'description': 'HLS streaming URL',
    'type': DATA_TYPES.STRING
  },
  'video_poster_url': {
    'description': 'Poster image displayed before video playback',
    'type': DATA_TYPES.STRING
  },
  'video_content_id': {
    'description': 'Internal content identifier of the video',
    'type': DATA_TYPES.STRING,
  },
  'video_owner_id': {
    'description': 'User ID of the video owner',
    'type': DATA_TYPES.STRING,
  },
  'content_duration_seconds': {
    'description': 'Video duration in seconds',
    'type': DATA_TYPES.STRING
  },
  'video_width': {
    'description': 'Original width of the video',
    'type': DATA_TYPES.STRING
  },
  'video_height': {
    'description': 'Original height of the video',
    'type': DATA_TYPES.STRING
  },
  'video_poster_width': {
    'description': 'Width of the video poster image',
    'type': DATA_TYPES.STRING
  },
  'video_poster_height': {
    'description': 'Height of the video poster image',
    'type': DATA_TYPES.STRING
  }
};
