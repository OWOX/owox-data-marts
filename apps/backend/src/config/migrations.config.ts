import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { createLogger } from '../common/logger/logger.service';
import { createDataSourceOptions } from './data-source-options.config';
import {
  runMigrations as executeRunMigrations,
  revertMigration as executeRevertMigration,
  listMigrations as executeListMigrations,
} from 'src/migrations/migration-utils';

/**
 * Enumeration of available migration actions
 */
enum MigrationAction {
  UP = 'up',
  DOWN = 'down',
  STATUS = 'status',
}

const logger = createLogger('MigrationAPI');

/**
 * Conditionally runs database migrations based on the RUN_MIGRATIONS environment variable.
 * Only executes migrations if RUN_MIGRATIONS is set to 'true'.
 * @throws {Error} When migration execution fails or database connection issues occur
 */
export async function runMigrationsIfNeeded(): Promise<void> {
  logger.debug('Checking if migrations should be executed...');
  const config = new ConfigService();

  if (!shouldRunMigrations(config)) {
    logger.debug('RUN_MIGRATIONS is not set to "true". Skipping migrations.');
    return;
  }

  logger.debug('RUN_MIGRATIONS is enabled. Proceeding with migrations.');
  await runMigrations();
}

/**
 * Executes all pending database migrations.
 * This will run all migrations that haven't been executed yet.
 * @throws {Error} When migration execution fails or database connection issues occur
 */
export async function runMigrations(): Promise<void> {
  logger.debug('Starting migration execution (UP action)');
  await executeMigrationAction(MigrationAction.UP);
}

/**
 * Reverts the most recent database migration.
 * This will undo the last executed migration.
 * @throws {Error} When migration revert fails or database connection issues occur
 */
export async function revertMigration(): Promise<void> {
  logger.debug('Starting migration revert (DOWN action)');
  await executeMigrationAction(MigrationAction.DOWN);
}

/**
 * Retrieves and displays the current status of database migrations.
 * @throws {Error} When unable to connect to database or retrieve migration status
 */
export async function getMigrationStatus(): Promise<void> {
  logger.debug('Retrieving migration status (STATUS action)');
  await executeMigrationAction(MigrationAction.STATUS);
}

/**
 * Executes a specific migration action with proper database connection management.
 * @param action - The migration action to execute (UP, DOWN, or STATUS)
 * @throws {Error} When database connection fails, migration execution fails, or invalid action provided
 */
async function executeMigrationAction(action: MigrationAction): Promise<void> {
  logger.debug(`Executing migration action: ${action}`);
  const config = new ConfigService();
  config.set('TYPEORM_LOGGING', 'schema');
  const dataSource = new DataSource(createDataSourceOptions(config));

  try {
    if (!dataSource.isInitialized) {
      logger.debug('Initializing data source for migration action');
      await dataSource.initialize();
      logger.debug('Data source initialized successfully');
    } else {
      logger.debug('Data source already initialized');
    }

    switch (action) {
      case MigrationAction.UP:
        logger.debug('Executing UP migrations...');
        await executeRunMigrations(dataSource);
        logger.debug('Migrations executed successfully');
        return;
      case MigrationAction.DOWN:
        logger.debug('Executing DOWN migration (revert)...');
        await executeRevertMigration(dataSource);
        logger.debug('Migration reverted successfully');
        return;
      case MigrationAction.STATUS: {
        logger.debug('Retrieving migration status...');
        await executeListMigrations(dataSource);
        logger.debug('Migration status retrieval completed');
        return;
      }
      default:
        logger.warn(`Unexpected migration action: ${action}`);
    }
  } catch (error) {
    logger.debug(`Migration action ${action} encountered an error: ${String(error)}`);
    logger.error(`Migration ${action} failed: ${String(error)}`);
    // Throwing an error for an external handler
    throw error;
  } finally {
    if (dataSource.isInitialized) {
      logger.debug('Destroying data source connection');
      await dataSource.destroy();
      logger.debug('Data source connection destroyed successfully');
    } else {
      logger.debug('Data source was not initialized, no cleanup needed');
    }
  }
}

/**
 * Determines whether migrations should be executed based on the RUN_MIGRATIONS environment variable.
 * @param config - The configuration service instance
 * @returns True if migrations should run, false otherwise
 */
function shouldRunMigrations(config: ConfigService): boolean {
  const runMigrationsValue = config.get<string>('RUN_MIGRATIONS')?.trim().toLowerCase() || 'true';
  logger.debug(`RUN_MIGRATIONS environment variable value: '${runMigrationsValue}'`);
  const shouldRun = runMigrationsValue === 'true';
  logger.debug(`Should run migrations: ${shouldRun}`);
  return shouldRun;
}
