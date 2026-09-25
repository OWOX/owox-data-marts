import { Core } from '@owox/connectors';
import { ConnectorMessageType } from '../../enums/connector-message-type-enum';

// Constants exported from @owox/connectors. Typed loosely because the
// package ships JS without .d.ts; we cast through `unknown` to a typed shape.
const EVENT_TYPE = (Core as unknown as { EVENT_TYPE: Record<string, string> }).EVENT_TYPE;
const LOG_LEVEL = (Core as unknown as { LOG_LEVEL: Record<string, string> }).LOG_LEVEL;
const CONTROL_ACTION = (Core as unknown as { CONTROL_ACTION: Record<string, string> })
  .CONTROL_ACTION;
const EXECUTION_STATUS = (Core as unknown as { EXECUTION_STATUS: Record<string, number> })
  .EXECUTION_STATUS;

/**
 * New uppercase Event protocol emitted by connector subprocess.
 * Documented event types: LOG, DATA, TRACE, ANALYTICS, STATE, CONTROL.
 */
export const NEW_EVENT_TYPES = [
  EVENT_TYPE.LOG,
  EVENT_TYPE.DATA,
  EVENT_TYPE.TRACE,
  EVENT_TYPE.ANALYTICS,
  EVENT_TYPE.STATE,
  EVENT_TYPE.CONTROL,
  EVENT_TYPE.CREDENTIALS,
  EVENT_TYPE.FIELDS,
] as const;
export type NewEventType = (typeof NEW_EVENT_TYPES)[number];

// Legacy numeric EXECUTION_STATUS values from @owox/connectors CommonConstants
const LEGACY_STATUS_IMPORT_DONE = EXECUTION_STATUS.IMPORT_DONE;

interface RawEvent {
  type: unknown;
  timestamp?: unknown;
  [key: string]: unknown;
}

/**
 * Detect whether a parsed JSON object is a new uppercase-typed Event
 * (LOG, DATA, TRACE, ANALYTICS, STATE, CONTROL) rather than a legacy
 * lowercase ConnectorMessage.
 */
export function isNewEvent(value: unknown): value is RawEvent {
  if (!value || typeof value !== 'object') return false;
  const t = (value as { type?: unknown }).type;
  if (typeof t !== 'string') return false;
  return (NEW_EVENT_TYPES as readonly string[]).includes(t);
}

/**
 * Translate a new-format Event into the existing legacy ConnectorMessage
 * shape so that ConnectorMessageSchema can parse it without changes to
 * downstream consumers.
 *
 * Mapping:
 *   LOG (info)          -> { type: 'log', message }
 *   LOG (warn)          -> { type: 'addWarningToCurrentStatus', warning }
 *   LOG (error)         -> { type: 'error', error }
 *   CONTROL.started     -> { type: 'log', message: '[CONTROL] started' }
 *   CONTROL.completed   -> { type: 'updateCurrentStatus', status: IMPORT_DONE(3) }
 *   CONTROL.failed      -> { type: 'error', error }
 *   CONTROL.paused      -> { type: 'log', message: '[CONTROL] paused' }
 *   CONTROL.cancelled   -> { type: 'log', message: '[CONTROL] cancelled' }
 *   STATE               -> { type: 'updateLastRequstedDate', date: state.lastRequestedDate }
 *   TRACE               -> { type: 'log', message: '[TRACE] ...' }
 *   ANALYTICS           -> { type: 'log', message: '[ANALYTICS] ...' }
 *   CREDENTIALS         -> { type: 'updateCredentials', credentials } (host persists)
 *   FIELDS              -> { type: 'updateFields', fields } (host persists)
 *   DATA                -> null (ignored — payload goes to storage directly)
 *
 * Returns null when the event should be dropped from the parser stream
 * (DATA events) or when the event is malformed.
 */
export function translateNewEventToLegacy(event: RawEvent): Record<string, unknown> | null {
  const at = typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString();
  const type = event.type as NewEventType;

  const legacy = translateEventBody(event, type, at);
  if (legacy !== null) {
    // Preserve the originating engine EVENT_TYPE so the run-history UI can tell
    // events apart that collapse into the same legacy `log` bucket (LOG.info,
    // TRACE, ANALYTICS, CONTROL lifecycle, STATE fallback) without sniffing the
    // message text. Legacy lowercase messages never reach this branch.
    legacy.eventType = type;
  }
  return legacy;
}

function translateEventBody(
  event: RawEvent,
  type: NewEventType,
  at: string
): Record<string, unknown> | null {
  switch (type) {
    case EVENT_TYPE.LOG: {
      const level = typeof event.level === 'string' ? event.level : LOG_LEVEL.INFO;
      const message = typeof event.message === 'string' ? event.message : JSON.stringify(event);
      if (level === LOG_LEVEL.ERROR) {
        return { type: ConnectorMessageType.ERROR, at, error: message };
      }
      if (level === LOG_LEVEL.WARN || level === 'warning') {
        return { type: ConnectorMessageType.WARNING, at, warning: message };
      }
      return { type: ConnectorMessageType.LOG, at, message };
    }

    case EVENT_TYPE.CONTROL: {
      const action = typeof event.action === 'string' ? event.action : 'unknown';
      if (action === CONTROL_ACTION.COMPLETED) {
        return { type: ConnectorMessageType.STATUS, at, status: LEGACY_STATUS_IMPORT_DONE };
      }
      if (action === CONTROL_ACTION.FAILED) {
        const error =
          typeof event.error === 'string' && event.error.length > 0
            ? event.error
            : 'Connector reported failure';
        return { type: ConnectorMessageType.ERROR, at, error };
      }
      // started / paused / cancelled / unknown — surface as a log line.
      return {
        type: ConnectorMessageType.LOG,
        at,
        message: `[CONTROL] ${action}`,
      };
    }

    case EVENT_TYPE.STATE: {
      const state = (event.state ?? {}) as Record<string, unknown>;
      const lastRequestedDate = state.lastRequestedDate;
      if (typeof lastRequestedDate === 'string' && lastRequestedDate.length > 0) {
        return {
          type: ConnectorMessageType.REQUESTED_DATE,
          at,
          date: lastRequestedDate,
        };
      }
      // Fall back to a log so we still surface the state in run history.
      return {
        type: ConnectorMessageType.LOG,
        at,
        message: `[STATE] ${JSON.stringify(state)}`,
      };
    }

    case EVENT_TYPE.TRACE: {
      const action = typeof event.action === 'string' ? event.action : 'trace';
      const details = event.details !== undefined ? JSON.stringify(event.details) : '';
      return {
        type: ConnectorMessageType.LOG,
        at,
        message: `[TRACE] ${action}${details ? ` ${details}` : ''}`,
      };
    }

    case EVENT_TYPE.ANALYTICS: {
      const metric = typeof event.metric === 'string' ? event.metric : 'metric';
      const value = event.value;
      const tags =
        event.tags && typeof event.tags === 'object'
          ? (event.tags as Record<string, unknown>)
          : undefined;
      const tagsText = tags !== undefined ? ` ${JSON.stringify(tags)}` : '';
      return {
        type: ConnectorMessageType.LOG,
        at,
        metric,
        value,
        ...(tags !== undefined ? { tags } : {}),
        message: `[ANALYTICS] ${metric}=${JSON.stringify(value)}${tagsText}`,
      };
    }

    case EVENT_TYPE.CREDENTIALS: {
      const credentials =
        event.credentials && typeof event.credentials === 'object'
          ? (event.credentials as Record<string, unknown>)
          : {};
      return { type: ConnectorMessageType.CREDENTIALS_UPDATE, at, credentials };
    }

    case EVENT_TYPE.FIELDS: {
      // Non-string entries are dropped rather than stringified: a field name is
      // a storage column name, and inventing one from a malformed entry would
      // persist a selection that does not match the table.
      const fields = Array.isArray(event.fields)
        ? event.fields.filter((field): field is string => typeof field === 'string')
        : [];
      return { type: ConnectorMessageType.FIELDS_UPDATE, at, fields };
    }

    case EVENT_TYPE.DATA:
      // Payload is consumed by the storage path, not the message stream.
      return null;

    default:
      return null;
  }
}
