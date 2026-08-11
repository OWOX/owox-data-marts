/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/ControlEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE, CONTROL_ACTION } from '../../Constants/CommonConstants.js';

const VALID_ACTIONS = Object.values(CONTROL_ACTION);

export class ControlEvent extends BaseEvent {
  constructor(action, options = {}) {
    super(EVENT_TYPE.CONTROL);
    const opts = options ?? {};
    if (!VALID_ACTIONS.includes(action)) {
      throw new Error(
        `Invalid control action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`
      );
    }
    this.action = action;
    this.error = opts.error ?? null;
  }

  toJSON() {
    const json = { ...super.toJSON(), action: this.action };
    if (this.error !== null) json.error = this.error;
    return json;
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.CONTROL) {
      throw new Error(
        `Invalid event type for ControlEvent: expected "${EVENT_TYPE.CONTROL}", got "${parsed.type}"`
      );
    }
    const event = new ControlEvent(parsed.action, { error: parsed.error });
    event.timestamp = parsed.timestamp;
    return event;
  }
}
