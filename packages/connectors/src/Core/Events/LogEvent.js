/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/LogEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE, LOG_LEVEL } from '../../Constants/CommonConstants.js';

const VALID_LEVELS = Object.values(LOG_LEVEL);

export class LogEvent extends BaseEvent {
  constructor(level, message) {
    super(EVENT_TYPE.LOG);
    if (!VALID_LEVELS.includes(level)) {
      throw new Error(`Invalid log level: ${level}. Must be one of: ${VALID_LEVELS.join(', ')}`);
    }
    if (typeof message !== 'string') {
      throw new Error(`LogEvent message must be a string, got ${typeof message}`);
    }
    this.level = level;
    this.message = message;
  }

  toJSON() {
    return { ...super.toJSON(), level: this.level, message: this.message };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.LOG) {
      throw new Error(
        `Invalid event type for LogEvent: expected "${EVENT_TYPE.LOG}", got "${parsed.type}"`
      );
    }
    const event = new LogEvent(parsed.level, parsed.message);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
