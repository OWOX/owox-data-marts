/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/BaseEvent.js

export class BaseEvent {
  constructor(type) {
    if (!type) throw new Error('Event type is required');
    this.type = type;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return { type: this.type, timestamp: this.timestamp };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    const event = new BaseEvent(parsed.type);
    event.timestamp = parsed.timestamp;
    return event;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}
