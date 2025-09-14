import { createLogger } from './common/logger/logger.service';
import { EnvManager } from '@owox/internal-helpers';

export function loadEnv(): void {
  const logger = createLogger('LoadEnv');

  const result = EnvManager.setupEnvironment();

  result.messages.forEach((message: string) => logger.log(message));
}
