/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/StateEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

export class StateEvent extends BaseEvent {
  constructor(state) {
    super(EVENT_TYPE.STATE);
    this.state = state;
  }

  toJSON() {
    return { ...super.toJSON(), state: this.state };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.STATE) {
      throw new Error(
        `Invalid event type for StateEvent: expected "${EVENT_TYPE.STATE}", got "${parsed.type}"`
      );
    }
    const event = new StateEvent(parsed.state);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
