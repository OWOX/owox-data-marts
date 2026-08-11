export enum LogCategory {
  LOG = 'log',
  WARNING = 'warning',
  ERROR = 'error',
  TRACE = 'trace',
  ANALYTICS = 'analytics',
  LIFECYCLE = 'lifecycle',
  STATUS = 'status',
  STATE = 'state',
  CREDENTIALS = 'credentials',
  UNKNOWN = 'unknown',
}

export enum LogSeverity {
  ERROR = 'error',
  WARN = 'warn',
  NORMAL = 'normal',
  MUTED = 'muted',
}

// Legacy ConnectorMessageType string values as persisted in a run's logs/errors.
const LEGACY_LOG = 'log';
const LEGACY_WARNING = 'addWarningToCurrentStatus';
const LEGACY_ERROR = 'error';
const LEGACY_STATUS = 'updateCurrentStatus';
const LEGACY_REQUESTED_DATE = 'updateLastRequstedDate';
const LEGACY_STATE = 'updateLastImportDate';
const LEGACY_CREDENTIALS = 'updateCredentials';
const LEGACY_UNKNOWN = 'unknown';

// Uppercase engine EVENT_TYPE values carried on new-run messages via `eventType`.
const EVENT_TRACE = 'TRACE';
const EVENT_ANALYTICS = 'ANALYTICS';
const EVENT_CONTROL = 'CONTROL';
const EVENT_STATE = 'STATE';

/**
 * Map a persisted run-log entry to a display category.
 *
 * `type` is the legacy ConnectorMessageType string. `eventType` is the optional
 * uppercase engine EVENT_TYPE hint present on new runs (absent on historical
 * runs). `message` is the human-readable text, used only to recover the event
 * kind on historical runs via the `[TRACE]`/`[ANALYTICS]`/`[CONTROL]`/`[STATE]`
 * prefixes the backend translator emits.
 *
 * Only the `log` bucket is ambiguous — LOG.info, TRACE, ANALYTICS, CONTROL
 * lifecycle and STATE fallbacks all collapse to legacy `log`; every other legacy
 * type maps to exactly one category directly.
 */
export function categorize(
  type: string | null | undefined,
  eventType: string | null | undefined,
  message: string
): LogCategory {
  switch (type) {
    case LEGACY_ERROR:
      return LogCategory.ERROR;
    case LEGACY_WARNING:
      return LogCategory.WARNING;
    case LEGACY_STATUS:
      return LogCategory.STATUS;
    case LEGACY_REQUESTED_DATE:
    case LEGACY_STATE:
      return LogCategory.STATE;
    case LEGACY_CREDENTIALS:
      return LogCategory.CREDENTIALS;
    case LEGACY_UNKNOWN:
      return LogCategory.UNKNOWN;
    case LEGACY_LOG:
      return categorizeLogBucket(eventType, message);
    default:
      return LogCategory.UNKNOWN;
  }
}

function categorizeLogBucket(eventType: string | null | undefined, message: string): LogCategory {
  // eventType hint (new runs) wins over the message prefix (historical fallback).
  if (eventType === EVENT_TRACE || (!eventType && message.startsWith('[TRACE]'))) {
    return LogCategory.TRACE;
  }
  if (eventType === EVENT_ANALYTICS || (!eventType && message.startsWith('[ANALYTICS]'))) {
    return LogCategory.ANALYTICS;
  }
  if (eventType === EVENT_CONTROL || (!eventType && message.startsWith('[CONTROL]'))) {
    return LogCategory.LIFECYCLE;
  }
  if (eventType === EVENT_STATE || (!eventType && message.startsWith('[STATE]'))) {
    return LogCategory.STATE;
  }
  return LogCategory.LOG;
}

export function severityOf(category: LogCategory): LogSeverity {
  switch (category) {
    case LogCategory.ERROR:
      return LogSeverity.ERROR;
    case LogCategory.WARNING:
      return LogSeverity.WARN;
    case LogCategory.TRACE:
    case LogCategory.ANALYTICS:
      return LogSeverity.MUTED;
    default:
      return LogSeverity.NORMAL;
  }
}

const CATEGORY_LABELS: Record<LogCategory, string> = {
  [LogCategory.LOG]: 'Log',
  [LogCategory.WARNING]: 'Warning',
  [LogCategory.ERROR]: 'Error',
  [LogCategory.TRACE]: 'Trace',
  [LogCategory.ANALYTICS]: 'Analytics',
  [LogCategory.LIFECYCLE]: 'Lifecycle',
  [LogCategory.STATUS]: 'Status',
  [LogCategory.STATE]: 'State',
  [LogCategory.CREDENTIALS]: 'Credentials',
  [LogCategory.UNKNOWN]: 'Unknown',
};

export function categoryLabel(category: LogCategory): string {
  return CATEGORY_LABELS[category];
}

// Numeric connector execution statuses (engine EXECUTION_STATUS) → readable labels.
const STATUS_LABELS: Record<number, string> = {
  1: 'Import in progress',
  2: 'Cleanup in progress',
  3: 'Import done',
  4: 'Cleanup done',
  5: 'Error',
};

/** Map a numeric status (string or number) to a readable label, or null if unknown. */
export function statusLabel(value: string | number): string | null {
  const n = typeof value === 'number' ? value : Number(value.trim());
  return Number.isInteger(n) && n in STATUS_LABELS ? STATUS_LABELS[n] : null;
}

/**
 * For a STATUS-type log (`updateCurrentStatus`) whose message is a bare numeric
 * status, return the readable label; otherwise return the message unchanged.
 */
export function relabelStatusMessage(type: string | null | undefined, message: string): string {
  if (type !== LEGACY_STATUS) return message;
  return statusLabel(message) ?? message;
}
