import { LoggerFactory, type Logger } from '@owox/internal-helpers';

export function createServiceLogger(serviceName: string): Logger {
  return LoggerFactory.createNamedLogger(`IDP:${serviceName}`);
}
