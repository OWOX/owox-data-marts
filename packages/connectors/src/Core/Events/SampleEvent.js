/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/SampleEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

/**
 * Carries a small sample of RAW (pre-cast) records out of a live-test run so the
 * builder can suggest field data paths. Emitted at most once per run.
 */
export class SampleEvent extends BaseEvent {
  constructor(records = []) {
    super(EVENT_TYPE.SAMPLE);
    this.records = Array.isArray(records) ? records : [];
  }

  toJSON() {
    return { ...super.toJSON(), records: this.records };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.SAMPLE) {
      throw new Error(
        `Invalid event type for SampleEvent: expected "${EVENT_TYPE.SAMPLE}", got "${parsed.type}"`
      );
    }
    const event = new SampleEvent(parsed.records);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
