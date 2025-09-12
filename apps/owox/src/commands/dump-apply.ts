import { getPackageInfo } from '../utils/package-info.js';
import { BaseCommand } from './base.js';

/**
 * Command to apply database dumps for the OWOX Data Marts application.
 * Requires @owox/backend to be installed.
 */
export default class DumpApply extends BaseCommand {
  static override description = 'Apply database dumps for the OWOX Data Marts application';
  static override examples = [
    '<%= config.bin %> dump-apply',
    '<%= config.bin %> dump-apply --log-format=json',
  ];
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  /**
   * Main execution method for the dump-apply command
   */
  public async run(): Promise<void> {
    const { flags } = await this.parse(DumpApply);
    this.loadEnvironment(flags);

    const packageInfo = getPackageInfo();
    this.log(`🚀 Starting OWOX Data Marts Dump Apply (v${packageInfo.version})...`);

    try {
      const { applyDump } = await import('@owox/backend');
      await applyDump();
    } catch (error) {
      this.handleStartupError(error);
    }
  }
}
