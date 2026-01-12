/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var creativesFields = {
  'account': {
    'description': 'URN identifying the advertising account associated with the creative. This field is read-only.',
    'type': DATA_TYPES.STRING
  },
  'campaign': {
    'description': 'URN identifying the campaign associated with the creative',
    'type': DATA_TYPES.STRING
  },
  'content': {
    'description': 'Content sponsored in the creative. On creation, it can be dynamic Ad content (follower, job, spotlight), text, document, or a reference to InMail Content or post (image, video, article, carousel). Content can also be extended and specified as inline content instead of an URN. A reference must be a adInMailContent{id}, share{id}, or ugcPost{id}.',
    'type': DATA_TYPES.STRING
  },
  'createdAt': {
    'description': 'Creation time',
    'type': DATA_TYPES.NUMBER
  },
  'createdBy': {
    'description': 'Entity (e.g., a person URN) that developed the creative',
    'type': DATA_TYPES.STRING
  },
  'id': {
    'description': 'Unique ID for a creative (e.g.,SponsoredCreativeUrn). Read-only',
    'type': DATA_TYPES.STRING
  },
  'intendedStatus': {
    'description': 'Creative user intended status. The creative intended status is set independently from parent entity status, but parent entity status overrides creative intended status in effect. For example, parent entity status may be PAUSED while creative status is ACTIVE, in which case the creative\'s effective status is PAUSED, and not served.ACTIVE - Creative development is complete and the creative is available for review and can be served.',
    'type': DATA_TYPES.STRING
  },
  'isServing': {
    'description': 'This indicates whether the creative is currently being served or not. This field is read-only.',
    'type': DATA_TYPES.BOOLEAN
  },
  'lastModifiedAt': {
    'description': 'Time at which the creative was last modified in milliseconds since epoch.',
    'type': DATA_TYPES.INTEGER
  },
  'lastModifiedBy': {
    'description': 'The entity (e.g., person URN) who modified the creative',
    'type': DATA_TYPES.STRING
  },
  'leadgenCallToAction': {
    'description': 'The field is needed for call to action. This currently only applies if the campaign objective is LEAD_GENERATION.',
    'type': DATA_TYPES.OBJECT
  },
  'review': {
    'description': 'Creative review status. The review status cannot be set/updated via the API but is started when the creative is activated (i.e., moves from draft state to active state). Hence, the review is absent (null) when the creative is in DRAFT state. Read-only.',
    'type': DATA_TYPES.OBJECT
  },
  'servingHoldReasons': {
    'description': 'Array that contains all the reasons why the creative is not serving. In the case a creative is being served, this field will be null and not present in the response.',
    'type': DATA_TYPES.ARRAY
  },
  'name': {
    'description': 'The name of the creative that can be set by advertiser; primarily used to make it easier to reference a Creative and to recall its purpose.',
    'type': DATA_TYPES.STRING
  }
} 