import { BaseCommand } from '../base.js';

/**
 * Migration management commands for OWOX Data Marts.
 *
 * This is the main entry point for all migration-related operations.
 * Use specific subcommands to perform migration tasks.
 */
export default class Migrations extends BaseCommand {
  static override description = 'Manage database migrations for OWOX Data Marts';
  static override examples = [
    '<%= config.bin %> migrations up',
    '<%= config.bin %> migrations down',
    '<%= config.bin %> migrations list',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Shows helpful message when migrations command is called without subcommands
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(Migrations);
    this.loadEnvironment(flags);

    const message =
      'Please specify a migration command. For detailed help and options, run this command with --help';

    this.log(message);
  }
}
