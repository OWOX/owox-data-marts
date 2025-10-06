import { BaseCommand } from '../base.js';

/**
 * Command to display database migration status.
 *
 * This command shows the current state of all migrations,
 * indicating which have been executed and which are pending.
 */
export default class MigrationsStatus extends BaseCommand {
  static override description = 'List database migration status';
  static override examples = ['<%= config.bin %> migrations status'];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Main execution method for displaying migration status.
   * Parses command flags, loads environment configuration, and retrieves
   * the current database migration status using the backend migration utilities.
   * @returns Promise that resolves when the migration status is displayed
   * @throws {Error} When migration status retrieval fails or startup errors occur
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(MigrationsStatus);
    this.loadEnvironment(flags);

    try {
      const { getMigrationStatus } = await import('@owox/backend');
      await getMigrationStatus();
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
