import { Flags } from '@oclif/core';

import { BaseCommand } from '../base.js';

/**
 * Command to list database migration status.
 *
 * This command shows the current state of all migrations,
 * indicating which have been executed and which are pending.
 */
export default class MigrationsStatus extends BaseCommand {
  static override description = 'List database migration status';
  static override examples = ['<%= config.bin %> migrations list'];
  static override flags = {
    ...BaseCommand.baseFlags,
    format: Flags.string({
      char: 'f',
      default: 'table',
      description: 'Output format for migration list',
      options: ['table', 'json'],
    }),
  };

  /**
   * Main execution method for listing migrations
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
