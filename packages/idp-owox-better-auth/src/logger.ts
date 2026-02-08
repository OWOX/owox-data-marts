/**
 * Shared logger utilities with basic redaction helpers.
 */
import { LoggerFactory, type Logger } from '@owox/internal-helpers';

let _logger: Logger | undefined;

function getLogger(): Logger {
  if (!_logger) {
    _logger = LoggerFactory.createNamedLogger('idp-owox-better-auth');
  }
  return _logger;
}

/**
 * Logger instance for idp-owox-better-auth.
 * Use Proxy to dynamically bind the logger instance to the logger methods.
 */
export const logger = new Proxy({} as Logger, {
  get(_target, prop: keyof Logger) {
    const loggerInstance = getLogger();
    const value = loggerInstance[prop];

    if (typeof value === 'function') {
      return value.bind(loggerInstance);
    }

    return value;
  },
});

const SENSITIVE_KEYS = [
  'token',
  'refreshToken',
  'accessToken',
  'authorization',
  'state',
  'code',
  'cookie',
  'csrf',
  'session',
];

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length <= 8) return value;
    return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
  }
  return value;
}

function redactingReplacer(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
    return redactValue(value);
  }
  return value;
}

/**
 * Console logging with light redaction to avoid leaking tokens/PII.
 * Keeps console.log available for temporary tracing while protecting secrets.
 */
export function safeConsoleLog(message: string, payload?: unknown): void {
  if (payload === undefined) {
    // eslint-disable-next-line no-console
    console.log(message);
    return;
  }
  const serialized =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, redactingReplacer, 2);
  // eslint-disable-next-line no-console
  console.log(message, serialized);
}
