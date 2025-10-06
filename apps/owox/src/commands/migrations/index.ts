import { BaseCommand } from '../base.js';

/**
 * Migration management commands for OWOX Data Marts.
 *
 * This is the main entry point for all migration-related operations.
 * Use specific subcommands (up, down, status) to perform migration tasks.
 * When called without subcommands, displays usage information.
 */
export default class Migrations extends BaseCommand {
  static override description = 'Manage database migrations for OWOX Data Marts';
  static override examples = [
    '<%= config.bin %> migrations up',
    '<%= config.bin %> migrations down',
    '<%= config.bin %> migrations status',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Shows helpful message when migrations command is called without subcommands.
   * Parses command flags and loads environment configuration before displaying usage guidance.
   * @returns Promise that resolves when the help message is displayed
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(Migrations);
    this.loadEnvironment(flags);

    const message =
      'Please specify a migration command. For detailed help and options, run this command with --help';

    this.log(message);
  }
}
