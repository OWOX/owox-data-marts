import { BaseCommand } from '../base.js';

/**
 * Command to run pending database migrations.
 *
 * This command executes all pending migrations in chronological order,
 * updating the database schema to the latest version. Uses distributed
 * locking to prevent concurrent migration execution across multiple instances.
 */
export default class MigrationsUp extends BaseCommand {
  static override description = 'Run pending database migrations';
  static override examples = [
    '<%= config.bin %> migrations up',
    '<%= config.bin %> migrations up --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Main execution method for running migrations.
   * Parses command flags, loads environment configuration, and executes
   * all pending database migrations using the backend migration utilities.
   * @returns Promise that resolves when all migrations are completed
   * @throws {Error} When migration execution fails or startup errors occur
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(MigrationsUp);
    this.loadEnvironment(flags);

    try {
      const { runMigrations } = await import('@owox/backend');
      await runMigrations();
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
