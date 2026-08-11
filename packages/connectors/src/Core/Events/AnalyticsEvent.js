/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/AnalyticsEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

export class AnalyticsEvent extends BaseEvent {
  constructor(metric, value, tags = {}) {
    super(EVENT_TYPE.ANALYTICS);
    this.metric = metric;
    this.value = value;
    this.tags = tags;
  }

  toJSON() {
    return { ...super.toJSON(), metric: this.metric, value: this.value, tags: this.tags };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.ANALYTICS) {
      throw new Error(
        `Invalid event type for AnalyticsEvent: expected "${EVENT_TYPE.ANALYTICS}", got "${parsed.type}"`
      );
    }
    const event = new AnalyticsEvent(parsed.metric, parsed.value, parsed.tags);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
