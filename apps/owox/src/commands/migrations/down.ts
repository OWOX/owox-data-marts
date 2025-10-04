import { Flags } from '@oclif/core';

import { BaseCommand } from '../base.js';

/**
 * Command to revert the last database migration.
 *
 * This command reverts the most recently executed migration,
 * rolling back the database schema to the previous state.
 */
export default class MigrationsDown extends BaseCommand {
  static override description = 'Revert the last database migration';
  static override examples = [
    '<%= config.bin %> migrations down',
    '<%= config.bin %> migrations down --force',
    '<%= config.bin %> migrations down --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force revert without confirmation prompt',
    }),
  };

  /**
   * Main execution method for reverting migrations
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(MigrationsDown);
    this.loadEnvironment(flags);

    this.log('🔄 Reverting last migration...');

    try {
      const { revertMigration } = await import('@owox/backend');
      await revertMigration();
      this.log('✅ Migration reverted successfully');
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
