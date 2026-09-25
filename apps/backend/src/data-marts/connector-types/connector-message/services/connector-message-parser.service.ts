import { Injectable, Logger } from '@nestjs/common';
import { ConnectorMessage, ConnectorMessageSchema } from '../schemas/connector-message.schema';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';
import { Core } from '@owox/connectors';
import { isNewEvent, translateNewEventToLegacy } from './connector-event.translator';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;

/** Keeps the shape summary readable, and bounded for a wide record. */
const MAX_DESCRIBED_KEYS = 20;

/**
 * A one-line description of a value's structure that contains none of its data.
 *
 * Field NAMES are schema rather than content, and they are what makes a schema failure
 * diagnosable — "which keys did this thing have" is the question a rejected message
 * raises. Values answer nothing that the validator's own error list does not.
 */
function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value !== 'object') return typeof value;

  const keys = Object.keys(value as Record<string, unknown>);
  const shown = keys.slice(0, MAX_DESCRIBED_KEYS);
  const omitted = keys.length - shown.length;
  return `object{${shown.join(', ')}${omitted > 0 ? `, +${omitted} more` : ''}}`;
}

@Injectable()
export class ConnectorMessageParserService {
  private logger = new Logger(ConnectorMessageParserService.name);

  /**
   * Parse a single line emitted by a connector subprocess.
   *
   * Supports two protocols:
   *  - New uppercase Event protocol (LOG, DATA, TRACE, ANALYTICS, STATE, CONTROL)
   *    emitted by current connectors. Translated into the legacy shape before
   *    schema validation so existing consumers continue to work.
   *  - Legacy lowercase types (log, updateCurrentStatus, updateLastRequstedDate,
   *    addWarningToCurrentStatus, error, ...) for backward compatibility with
   *    older connectors still emitting the previous format.
   *
   * Returns `null` when the event should be dropped from the message stream
   * (e.g. DATA events whose payload is consumed by the storage path).
   */
  parse(message: string): ConnectorMessage | null {
    let asJson: unknown;
    try {
      asJson = JSON.parse(message);
    } catch {
      return this.parseAsUnknown(message);
    }

    const candidate = isNewEvent(asJson) ? translateNewEventToLegacy(asJson) : asJson;
    if (candidate === null) {
      // DATA events and similar non-message events are intentionally dropped.
      return null;
    }

    const parsedMessage = ConnectorMessageSchema.safeParse(candidate);
    if (!parsedMessage.success) {
      // Shape and size only, never values. A connector line is whatever an upstream API
      // we do not control echoed back, and this metadata is spread into structured logs
      // (CustomLoggerService.destructureParams) with no `redact` configuration anywhere
      // to catch what lands there. Logging the raw line and the parsed object made the
      // exposure unbounded and stopped only at credential-shaped payloads; a schema
      // failure is diagnosed from the field names and the validator's own complaint, so
      // there is nothing the values were buying.
      this.logger.warn(`Schema validation failed for message:`, {
        messageLength: message.length,
        shape: describeShape(asJson),
        errors: parsedMessage.error.errors,
      });
      return this.parseAsUnknown(message);
    }
    return parsedMessage.data;
  }

  private parseAsUnknown(message: string): ConnectorMessage {
    const safeMessage = this.redactCredentialUpdateMessage(message).trim();

    return {
      type: ConnectorMessageType.UNKNOWN,
      at: new Date().toISOString(),
      message: safeMessage,
      toFormattedString: () => `[UNKNOWN] ${safeMessage}`,
    };
  }

  private redactCredentialUpdateMessage(message: string): string {
    if (
      !message.includes('updateCredentials') &&
      !message.includes(GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD)
    ) {
      return message;
    }

    return '[REDACTED updateCredentials message]';
  }
}
