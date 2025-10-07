import { DataSource, QueryRunner } from 'typeorm';

import { createLogger } from '../common/logger/logger.service';

const LOCK_TABLE_NAME = '__migrations_lock__';
const WAIT_DELAY_SECONDS = 5; // Wait 5 seconds between retries
const MAX_WAIT_SECONDS = 5 * 60; // Max 5 minutes total

const logger = createLogger('MigrationService');

/**
 * Instead of dropping tables, rename them to preserve data.
 * Creates a backup table with incremental naming if backup already exists.
 * @param queryRunner - TypeORM query runner instance
 * @param tableName - Name of the table to backup
 * @throws {Error} When table operations fail
 */
export async function softDropTable(queryRunner: QueryRunner, tableName: string): Promise<void> {
  logger.debug(`Starting soft drop for table: ${tableName}`);
  let n = 0;
  let backupName = `${tableName}_backup`;

  logger.debug(`Checking if backup table exists: ${backupName}`);
  while (await queryRunner.hasTable(backupName)) {
    n += 1;
    backupName = `${tableName}_backup_${n}`;
    logger.debug(`Backup table exists, trying new name: ${backupName}`);
  }

  logger.debug(`Renaming table ${tableName} to ${backupName}`);
  await queryRunner.renameTable(tableName, backupName);
  logger.debug(`Successfully renamed table ${tableName} to ${backupName}`);
}

/**
 * Runs pending migrations with distributed locking to prevent concurrent execution.
 * @param dataSource - TypeORM DataSource instance
 * @throws {Error} When migration execution fails or lock cannot be acquired
 */
export async function runMigrations(dataSource: DataSource): Promise<void> {
  logger.debug('Attempting to acquire migrations lock...');
  const releaseLock = await acquireMigrationsLock(dataSource);

  try {
    logger.debug('Lock acquired, starting migration execution...');
    const migrations = await dataSource.runMigrations();

    if (migrations.length === 0) {
      logger.debug('No new migrations to run (migrations.length = 0)');
    } else {
      logger.log(`Successfully executed ${migrations.length} migration(s)`);
    }
  } finally {
    logger.debug('Releasing migrations lock...');
    await releaseLock().catch(err => {
      logger.error(`Failed to release migrations lock: ${String(err)}`);
    });
    logger.debug('Migration execution completed');
  }
}

/**
 * Reverts the last executed migration with distributed locking.
 * @param dataSource - TypeORM DataSource instance
 * @throws {Error} When migration revert fails or lock cannot be acquired
 */
export async function revertMigration(dataSource: DataSource): Promise<void> {
  logger.debug('Attempting to acquire migrations lock for revert operation...');
  const releaseLock = await acquireMigrationsLock(dataSource);

  try {
    logger.debug('Lock acquired, starting migration revert...');
    await dataSource.undoLastMigration();
    logger.debug('Successfully reverted last migration');
  } finally {
    logger.debug('Releasing migrations lock after revert...');
    await releaseLock().catch(err => {
      logger.error(`Failed to release migrations lock: ${String(err)}`);
    });
    logger.debug('Revert operation completed');
  }
}

/**
 * Lists migration status (executed and pending migrations).
 * @param dataSource - TypeORM DataSource instance
 * @returns Promise that resolves when migration status is displayed
 * @throws {Error} When unable to retrieve migration status
 */
export async function listMigrations(dataSource: DataSource): Promise<void> {
  logger.debug('Retrieving migration status from database...');
  logger.log('Migration status:');

  try {
    const hasPendingMigrations = await dataSource.showMigrations();

    logger.debug(
      `Migration status check completed. Has pending migrations: ${hasPendingMigrations}`
    );

    if (hasPendingMigrations) {
      logger.log('There are pending migrations that need to be executed');
    } else {
      logger.log('All migrations are up to date');
    }
  } catch (error) {
    logger.error(`Failed to get migrations status: ${String(error)}`);
    throw error;
  }
}

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
 * @returns Promise that resolves to a function that releases the lock
 * @throws {Error} When lock cannot be acquired within the timeout period
 */
async function acquireMigrationsLock(dataSource: DataSource): Promise<() => Promise<void>> {
  logger.debug(`Attempting to acquire migrations lock using table: ${LOCK_TABLE_NAME}`);
  const createSql = `CREATE TABLE ${LOCK_TABLE_NAME} (id INTEGER PRIMARY KEY)`;
  const dropSql = `DROP TABLE ${LOCK_TABLE_NAME}`;

  const startAt = Date.now();
  logger.debug(`Lock acquisition started at: ${new Date(startAt).toISOString()}`);

  while (true) {
    try {
      await dataSource.query(createSql);
      logger.debug(`Successfully acquired migrations lock using table ${LOCK_TABLE_NAME}`);
      break;
    } catch (error: unknown) {
      const isAlreadyExists = String(error).toLowerCase().includes('already exists');
      if (!isAlreadyExists) {
        throw error;
      }

      const elapsedSeconds = Math.floor((Date.now() - startAt) / 1000);
      if (Date.now() - startAt > MAX_WAIT_SECONDS * 1000) {
        logger.debug(`Lock acquisition timed out after ${elapsedSeconds} seconds`);
        throw new Error(`Timed out waiting for migrations lock after ${MAX_WAIT_SECONDS} seconds`);
      }

      logger.debug(
        `Lock table exists (elapsed: ${elapsedSeconds}s). Waiting ${WAIT_DELAY_SECONDS}s before retry...`
      );
      await sleepInSeconds(WAIT_DELAY_SECONDS);
    }
  }

  return async () => {
    await dataSource.query(dropSql);
    logger.debug(`Successfully released migrations lock by dropping ${LOCK_TABLE_NAME}`);
  };
}

/**
 * Utility function to pause execution for specified number of seconds.
 * @param seconds - Number of seconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleepInSeconds(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}
