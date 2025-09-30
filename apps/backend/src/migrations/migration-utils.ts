import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createDataSourceOptions } from '../config/data-source-options.config';
import { loadEnv } from '../load-env';
import { createLogger } from '../common/logger/logger.service';

const logger = createLogger('MigrationService');

/**
 * Runs pending migrations
 */
export async function runMigrations(): Promise<void> {
  const logger = createLogger('MigrationRunner');
  loadEnv();

  const configService = new ConfigService();
  const dataSource = new DataSource(createDataSourceOptions(configService));

  try {
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
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Reverts the last migration
 */
export async function revertMigration(): Promise<void> {
  const logger = createLogger('MigrationReverter');
  loadEnv();

  const configService = new ConfigService();
  const dataSource = new DataSource(createDataSourceOptions(configService));

  try {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    await dataSource.undoLastMigration();
    logger.log('Successfully reverted the last migration');
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * Lists migration status (executed and pending)
 */
export async function listMigrations(): Promise<{ executed: string[]; pending: string[] }> {
  const logger = createLogger('MigrationLister');
  loadEnv();

  const configService = new ConfigService();
  const dataSource = new DataSource(createDataSourceOptions(configService));

  try {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    const executedMigrations = (await dataSource
      .query(
        `
      SELECT * FROM migrations ORDER BY timestamp ASC
    `
      )
      .catch(() => [])) as Array<{ name: string; timestamp: number }>;

    const allMigrations = dataSource.migrations;
    const executedNames = new Set(executedMigrations.map(m => m.name));
    const pendingMigrations = allMigrations.filter(m => m.name && !executedNames.has(m.name));

    const executed = executedMigrations.map(m => m.name);
    const pending = pendingMigrations
      .map(m => m.name)
      .filter((name): name is string => name !== undefined);

    logger.log(`Executed migrations: ${executed.length}`);
    executed.forEach(name => logger.log(`✓ ${name}`));

    logger.log(`Pending migrations: ${pending.length}`);
    pending.forEach(name => logger.log(`○ ${name}`));

    return { executed, pending };
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}
