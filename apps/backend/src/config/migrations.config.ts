import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { createLogger } from '../common/logger/logger.service';
import { createDataSourceOptions } from './data-source-options.config';
import {
  createPluginCollectionsDataSourceOptions,
  PLUGIN_COLLECTIONS_DATA_SOURCE,
} from './plugin-collections-data-source-options.config';
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
 * Only executes migrations if RUN_MIGRATIONS is set to 'true' (default behavior when not set).
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
 * Shows which migrations have been executed and which are pending.
 * @throws {Error} When unable to connect to database or retrieve migration status
 */
export async function getMigrationStatus(): Promise<void> {
  logger.debug('Retrieving migration status (STATUS action)');
  await executeMigrationAction(MigrationAction.STATUS);
}

/**
 * Executes a specific migration action with proper database connection management.
 * Automatically handles database connection initialization and cleanup.
 * @param action - The migration action to execute (UP, DOWN, or STATUS)
 * @throws {Error} When database connection fails, migration execution fails, or invalid action provided
 */
async function executeMigrationAction(action: MigrationAction): Promise<void> {
  logger.debug(`Executing migration action: ${action}`);
  const config = new ConfigService();
  config.set('TYPEORM_LOGGING', 'schema');
  const main = new DataSource(createDataSourceOptions(config));
  const collections = new DataSource(createPluginCollectionsDataSourceOptions(config));
  const requestedDownTarget = config.get<string>('MIGRATIONS_DATA_SOURCE')?.trim() || 'main';
  if (
    action === MigrationAction.DOWN &&
    !['main', PLUGIN_COLLECTIONS_DATA_SOURCE].includes(requestedDownTarget)
  ) {
    if (requestedDownTarget === 'all') {
      throw new Error(
        `MIGRATIONS_DATA_SOURCE=all is unsafe for down migrations; select main or ${PLUGIN_COLLECTIONS_DATA_SOURCE}`
      );
    }
    throw new Error(`Unsupported MIGRATIONS_DATA_SOURCE: ${requestedDownTarget}`);
  }
  const target = action === MigrationAction.DOWN ? requestedDownTarget : 'all';
  if (!['main', PLUGIN_COLLECTIONS_DATA_SOURCE, 'all'].includes(target)) {
    throw new Error(`Unsupported MIGRATIONS_DATA_SOURCE: ${target}`);
  }
  // UP applies main declarations before collection storage. DOWN intentionally targets
  // one history: reverting one migration from each independent DB can over-revert either.
  const dataSources =
    target === 'main'
      ? [main]
      : target === PLUGIN_COLLECTIONS_DATA_SOURCE
        ? [collections]
        : [main, collections];

  try {
    for (const dataSource of dataSources) {
      await dataSource.initialize();
      switch (action) {
        case MigrationAction.UP:
          await executeRunMigrations(dataSource);
          break;
        case MigrationAction.DOWN:
          await executeRevertMigration(dataSource);
          break;
        case MigrationAction.STATUS:
          await executeListMigrations(dataSource);
          break;
        default:
          logger.warn(`Unexpected migration action: ${action}`);
      }
    }
  } finally {
    for (const dataSource of dataSources) {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  }
}

/**
 * Determines whether migrations should be executed based on the RUN_MIGRATIONS environment variable.
 * Defaults to 'true' when RUN_MIGRATIONS is not set or empty.
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
