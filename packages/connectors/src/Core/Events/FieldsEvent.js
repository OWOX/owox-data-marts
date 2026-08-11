/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/FieldsEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

/**
 * Field list discovered at run time, emitted by sources whose schema is not
 * known until the data is read (a spreadsheet's header row, for instance).
 * The host persists it so the data mart's field selection reflects what the
 * run actually wrote, instead of a stale list from when it was configured.
 */
export class FieldsEvent extends BaseEvent {
  constructor(fields) {
    super(EVENT_TYPE.FIELDS);
    if (!Array.isArray(fields)) {
      throw new Error(
        `FieldsEvent fields must be an array, got ${fields === null ? 'null' : typeof fields}`
      );
    }
    if (fields.some(field => typeof field !== 'string')) {
      throw new Error('FieldsEvent fields must all be strings');
    }
    this.fields = fields;
  }

  toJSON() {
    return { ...super.toJSON(), fields: this.fields };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.FIELDS) {
      throw new Error(
        `Invalid event type for FieldsEvent: expected "${EVENT_TYPE.FIELDS}", got "${parsed.type}"`
      );
    }
    const event = new FieldsEvent(parsed.fields);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
