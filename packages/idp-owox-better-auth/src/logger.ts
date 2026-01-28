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
