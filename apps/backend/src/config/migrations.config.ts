import { createLogger } from '../common/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { createDataSourceOptions } from './data-source-options.config';
import { DataSource } from 'typeorm';

export async function runMigrationsIfNeeded(config: ConfigService): Promise<void> {
  const logger = createLogger('MigrationRunner');

  const runMigrations = config.get<string>('RUN_MIGRATIONS') ?? 'true';
  const shouldRun = runMigrations === 'true';

  if (!shouldRun) {
    logger.log('RUN_MIGRATIONS is not set to "true". Skipping migrations.');
    return;
  }

  const dataSource = new DataSource(createDataSourceOptions(config));

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const releaseLock = await acquireMigrationsLock(dataSource, logger);
  try {
    const migrations = await dataSource.runMigrations();
    if (migrations.length === 0) {
      logger.log('No new migrations to run');
    } else {
      logger.log(`Executed ${migrations.length} migration(s):`);
      migrations.forEach(m => {
        logger.log(`- ${m.name}`);
      });
    }
  } finally {
    await releaseLock().catch(err =>
      logger.error(`Failed to release migrations lock: ${String(err)}`)
    );
    await dataSource.destroy();
  }
}

const LOCK_TABLE_NAME = '__migrations_lock__';
const WAIT_DELAY_SECONDS = 5; // Wait 5 seconds between retries
const MAX_WAIT_SECONDS = 5 * 60; // Max 5 minutes total

/**
 * Acquires a distributed lock for running migrations to prevent multiple instances
 * from running the same migration simultaneously.
 *
 * **How it works:**
 * 1. Attempts to create a temporary lock table `__migrations_lock__`
 * 2. If table creation succeeds - lock is acquired, migration can proceed
 * 3. If table already exists - another instance is running migrations, wait and retry
 * 4. After migration completes - lock table is dropped to release the lock
 *
 * **Multi-instance safety:**
 * - Service 0 creates lock table and runs migrations
 * - Services 1-9 wait until lock table is dropped
 * - After lock release, services 1-9 check migration status and skip already completed ones
 *
 * @see https://github.com/typeorm/typeorm/issues/4588 - Known TypeORM issue with multiple instances
 *
 * @param dataSource - TypeORM DataSource instance
 * @param logger - Logger instance for debugging
 * @returns Promise that resolves to a release function
 */
async function acquireMigrationsLock(
  dataSource: DataSource,
  logger: ReturnType<typeof createLogger>
): Promise<() => Promise<void>> {
  const createSql = `CREATE TABLE ${LOCK_TABLE_NAME} (id INTEGER PRIMARY KEY)`;
  const dropSql = `DROP TABLE ${LOCK_TABLE_NAME}`;

  const startAt = Date.now();

  while (true) {
    try {
      await dataSource.query(createSql);
      logger.log(`Acquired migrations lock using table ${LOCK_TABLE_NAME}`);
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isAlreadyExists = message.toLowerCase().includes('already exists');
      if (!isAlreadyExists) {
        throw error;
      }

      if (Date.now() - startAt > MAX_WAIT_SECONDS * 1000) {
        throw new Error(`Timed out waiting for migrations lock after ${MAX_WAIT_SECONDS} seconds`);
      }

      logger.log(`Another instance is running migrations. Waiting ${WAIT_DELAY_SECONDS}s...`);
      await sleepInSeconds(WAIT_DELAY_SECONDS);
    }
  }

  return async () => {
    await dataSource.query(dropSql);
    logger.log(`Released migrations lock by dropping ${LOCK_TABLE_NAME}`);
  };
}

function sleepInSeconds(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
