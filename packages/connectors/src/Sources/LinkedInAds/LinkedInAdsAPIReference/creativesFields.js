/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var creativesFields = {
  'account': {
    'description': 'URN identifying the advertising account associated with the creative. This field is read-only.',
    'type': 'string'
  },
  'campaign': {
    'description': 'URN identifying the campaign associated with the creative',
    'type': 'string'
  },
  'content': {
    'description': 'Content sponsored in the creative. On creation, it can be dynamic Ad content (follower, job, spotlight), text, document, or a reference to InMail Content or post (image, video, article, carousel). Content can also be extended and specified as inline content instead of an URN. A reference must be a adInMailContent{id}, share{id}, or ugcPost{id}.',
    'type': 'string'
  },
  'createdAt': {
    'description': 'Creation time',
    'type': 'long',
    'GoogleBigQueryType': 'numeric'
  },
  'createdBy': {
    'description': 'Entity (e.g., a person URN) that developed the creative',
    'type': 'string'
  },
  'id': {
    'description': 'Unique ID for a creative (e.g.,SponsoredCreativeUrn). Read-only',
    'type': 'string'
  },
  'intendedStatus': {
    'description': 'Creative user intended status. The creative intended status is set independently from parent entity status, but parent entity status overrides creative intended status in effect. For example, parent entity status may be PAUSED while creative status is ACTIVE, in which case the creative\'s effective status is PAUSED, and not served.ACTIVE - Creative development is complete and the creative is available for review and can be served.',
    'type': 'string'
  },
  'isServing': {
    'description': 'This indicates whether the creative is currently being served or not. This field is read-only.',
    'type': 'boolean'
  },
  'lastModifiedAt': {
    'description': 'Time at which the creative was last modified in milliseconds since epoch.',
    'type': 'long'
  },
  'lastModifiedBy': {
    'description': 'The entity (e.g., person URN) who modified the creative',
    'type': 'string'
  },
  'leadgenCallToAction': {
    'description': 'The field is needed for call to action. This currently only applies if the campaign objective is LEAD_GENERATION.',
    'type': 'object'
  },
  'review': {
    'description': 'Creative review status. The review status cannot be set/updated via the API but is started when the creative is activated (i.e., moves from draft state to active state). Hence, the review is absent (null) when the creative is in DRAFT state. Read-only.',
    'type': 'object'
  },
  'servingHoldReasons': {
    'description': 'Array that contains all the reasons why the creative is not serving. In the case a creative is being served, this field will be null and not present in the response.',
    'type': 'string[]'
  },
  'name': {
    'description': 'The name of the creative that can be set by advertiser; primarily used to make it easier to reference a Creative and to recall its purpose.',
    'type': 'string'
  }
} 