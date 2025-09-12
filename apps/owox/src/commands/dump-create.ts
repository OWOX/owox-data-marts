import { getPackageInfo } from '../utils/package-info.js';
import { BaseCommand } from './base.js';

/**
 * Command to create database dumps for the OWOX Data Marts application.
 * Requires @owox/backend to be installed.
 */
export default class DumpCreate extends BaseCommand {
  static override description = 'Create database dumps for the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> dump-create',
    '<%= config.bin %> dump-create --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Main execution method for the dump-create command
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(DumpCreate);
    this.loadEnvironment(flags);

    const packageInfo = getPackageInfo();
    this.log(`🚀 Starting OWOX Data Marts Dump Create (v${packageInfo.version})...`);

    try {
      const { dumpInserts } = await import('@owox/backend');
      await dumpInserts();
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
