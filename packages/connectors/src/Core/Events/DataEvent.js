/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/DataEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

export class DataEvent extends BaseEvent {
  constructor(node, records, schema = null) {
    super(EVENT_TYPE.DATA);
    if (!Array.isArray(records)) {
      throw new Error(
        `DataEvent records must be an array, got ${records === null ? 'null' : typeof records}`
      );
    }
    this.node = node;
    this.records = records;
    this.schema = schema;
  }

  toJSON() {
    const json = { ...super.toJSON(), node: this.node, records: this.records };
    if (this.schema) json.schema = this.schema;
    return json;
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.DATA) {
      throw new Error(
        `Invalid event type for DataEvent: expected "${EVENT_TYPE.DATA}", got "${parsed.type}"`
      );
    }
    const event = new DataEvent(parsed.node, parsed.records, parsed.schema);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
