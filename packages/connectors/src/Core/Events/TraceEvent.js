/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/TraceEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

export class TraceEvent extends BaseEvent {
  constructor(action, details = {}) {
    super(EVENT_TYPE.TRACE);
    this.action = action;
    this.details = details;
  }

  toJSON() {
    return { ...super.toJSON(), action: this.action, details: this.details };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.TRACE) {
      throw new Error(
        `Invalid event type for TraceEvent: expected "${EVENT_TYPE.TRACE}", got "${parsed.type}"`
      );
    }
    const event = new TraceEvent(parsed.action, parsed.details);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
