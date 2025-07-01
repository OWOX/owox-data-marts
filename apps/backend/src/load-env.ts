import { config as dotenvConfig } from 'dotenv';
import { createLogger } from './common/logger/logger.service';
import { join } from 'path';
import { existsSync } from 'fs';

let isLoaded = false;

export function loadEnv(): void {
  if (isLoaded) return;

  const baseEnvName = '.env';
  const devEnvName = '.env.dev';

  const isCompiled = __dirname.includes('dist');
  const baseDirPath = join(__dirname, ...(isCompiled ? ['..', '..'] : ['..']));

  const baseEnvPath = join(baseDirPath, baseEnvName);
  const devEnvPath = join(baseDirPath, devEnvName);

  const logs: string[] = [];

  const baseEnvExist = existsSync(baseEnvPath);
  if (baseEnvExist) {
    dotenvConfig({ path: baseEnvPath });
    logs.push(`Loaded ${baseEnvName} from ${baseEnvPath}`);
  }

  const devEnvExist = existsSync(devEnvPath);
  if (devEnvExist) {
    dotenvConfig({ path: devEnvPath, override: true });
    logs.push(`Loaded and overrided ${devEnvName} from ${devEnvPath}`);
  }

  const logger = createLogger('LoadEnv');
  logs.map(message => logger.log(message));

  if (!baseEnvExist && !devEnvExist) {
    logger.warn(`No ${baseEnvName} or ${devEnvName} file found`);
  }

  isLoaded = true;
}
