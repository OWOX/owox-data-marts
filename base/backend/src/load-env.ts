import { createLogger } from './common/logger/logger.service';
import { EnvManager, LogLevel } from '@owox/internal-helpers';

export function loadEnv(): void {
  const logger = createLogger('LoadEnv');

  const result = EnvManager.setupEnvironment();

  result.messages.forEach(logMessage => {
    switch (logMessage.logLevel) {
      case LogLevel.LOG:
        logger.log(logMessage.message);
        break;
      case LogLevel.WARN:
        logger.warn(logMessage.message);
        break;
      case LogLevel.ERROR:
        logger.error(logMessage.message);
        break;
      default:
        logger.log(logMessage.message);
    }
  });
}
