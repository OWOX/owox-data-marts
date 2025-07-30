import { ConfigService } from '@nestjs/config';
import * as envPaths from 'env-paths';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { createLogger } from '../common/logger/logger.service';

/**
 * Determines the SQLite database file path based on configuration.
 *
 * If `SQLITE_DB_PATH` environment variable is set, uses that path directly.
 * Otherwise, uses cross-platform application data directory with 'owox/sqlite/app.db' structure.
 * Automatically creates the database directory if it doesn't exist.
 *
 * @param config - NestJS ConfigService instance for accessing environment variables
 * @returns The absolute path to the SQLite database file
 * @throws {Error} When database directory cannot be created due to permissions or other filesystem errors
 *
 * @example
 * ```typescript
 * // With SQLITE_DB_PATH env variable
 * SQLITE_DB_PATH=./var/sqlite/app.db
 * // Returns: /project/root/var/sqlite/app.db
 *
 * // Without env variable (macOS example)
 * // Returns: ~/Library/Application Support/owox/sqlite/app.db
 * ```
 */
export function getSqliteDatabasePath(config: ConfigService): string {
  const logger = createLogger('SQLiteDatabasePath');

  const envDbPath = config.get<string>('SQLITE_DB_PATH');

  let dbPath: string;

  if (envDbPath) {
    logger.log(`Using SQLite database path from \`SQLITE_DB_PATH\` env: ${envDbPath}`);
    dbPath = envDbPath;
  } else {
    const paths = envPaths.default('owox', { suffix: '' });
    dbPath = join(paths.data, 'sqlite', 'app.db');
    logger.log(`Using system app data directory for SQLite: ${dbPath}`);
  }

  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    try {
      mkdirSync(dbDir, { recursive: true });
      logger.log(`Created SQLite database directory: ${dbDir}`);
    } catch (error) {
      throw new Error(
        `Failed to create SQLite database directory: ${dbDir}. ${(error as Error).message}`
      );
    }
  }

  return dbPath;
}
