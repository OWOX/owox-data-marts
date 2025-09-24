import { EnvManager, LoggerFactory } from '@owox/internal-helpers';

export function loadEnv(): void {
  LoggerFactory.logConfigInfo();
  const logger = LoggerFactory.createNamedLogger('LoadEnv');

  const result = EnvManager.setupEnvironment();

  result.messages.forEach(logMessage => {
    logger.log(logMessage.logLevel, logMessage.message, undefined, true);
  });
}
