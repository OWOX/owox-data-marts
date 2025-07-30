import dataSource from '../data-source';
import { createLogger } from '../common/logger/logger.service';
import { ConfigService } from '@nestjs/config';

export async function runMigrationsIfNeeded(config: ConfigService): Promise<void> {
  const logger = createLogger('MigrationRunner');

  const runMigrations = config.get<string>('RUN_MIGRATIONS') ?? 'true';
  const shouldRun = runMigrations === 'true';

  if (!shouldRun) {
    logger.log('RUN_MIGRATIONS is not set to "true". Skipping migrations.');
    return;
  }

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const migrations = await dataSource.runMigrations();
  if (migrations.length === 0) {
    logger.log('No new migrations to run');
  } else {
    logger.log(`Executed ${migrations.length} migration(s):`);
    migrations.forEach(m => {
      logger.log(`- ${m.name}`);
    });
  }
}
