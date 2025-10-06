import { BaseCommand } from '../base.js';

/**
 * Command to revert the last database migration.
 *
 * This command reverts the most recently executed migration,
 * rolling back the database schema to the previous state.
 * Uses distributed locking to prevent concurrent operations.
 */
export default class MigrationsDown extends BaseCommand {
  static override description = 'Revert the last database migration';
  static override examples = [
    '<%= config.bin %> migrations down',
    '<%= config.bin %> migrations down --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Main execution method for reverting migrations.
   * Parses command flags, loads environment configuration, and reverts
   * the last executed database migration using the backend migration utilities.
   * @returns Promise that resolves when the migration is reverted
   * @throws {Error} When migration revert fails or startup errors occur
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(MigrationsDown);
    this.loadEnvironment(flags);

    try {
      const { revertMigration } = await import('@owox/backend');
      await revertMigration();
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
