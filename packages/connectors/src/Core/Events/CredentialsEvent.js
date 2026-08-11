/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/Events/CredentialsEvent.js
import { BaseEvent } from './BaseEvent.js';
import { EVENT_TYPE } from '../../Constants/CommonConstants.js';

/**
 * Runtime credential update emitted when a connector rotates a secret mid-run
 * (e.g. an OAuth refresh token the provider rotated). The host allowlists and
 * persists the fields so the next run can reuse them.
 */
export class CredentialsEvent extends BaseEvent {
  constructor(credentials) {
    super(EVENT_TYPE.CREDENTIALS);
    if (credentials === null || typeof credentials !== 'object' || Array.isArray(credentials)) {
      throw new Error(
        `CredentialsEvent credentials must be an object, got ${Array.isArray(credentials) ? 'array' : typeof credentials}`
      );
    }
    this.credentials = credentials;
  }

  toJSON() {
    return { ...super.toJSON(), credentials: this.credentials };
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error(
        `Invalid event JSON: expected object, got ${parsed === null ? 'null' : typeof parsed}`
      );
    }
    if (parsed.type !== EVENT_TYPE.CREDENTIALS) {
      throw new Error(
        `Invalid event type for CredentialsEvent: expected "${EVENT_TYPE.CREDENTIALS}", got "${parsed.type}"`
      );
    }
    const event = new CredentialsEvent(parsed.credentials);
    event.timestamp = parsed.timestamp;
    return event;
  }
}
