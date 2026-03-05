import { DataSource } from 'typeorm';

/**
 * Deletes all rows from all non-system tables in a SQLite database.
 *
 * Excludes SQLite internal tables (sqlite_*) and the migrations table.
 * Temporarily disables foreign keys to avoid constraint violations during cleanup,
 * then re-enables them.
 */
export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  const tables: Array<{ name: string }> = await dataSource.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
  );

  await dataSource.query('PRAGMA foreign_keys = OFF');

  for (const { name } of tables) {
    await dataSource.query(`DELETE FROM "${name}"`);
  }

  await dataSource.query('PRAGMA foreign_keys = ON');
}
