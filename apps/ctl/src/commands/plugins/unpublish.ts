import { BaseCommand } from '../../base-command.js';
import {
  audienceFlags,
  repositoryArg,
  scopeFlag,
  toPublishInput,
  unpublishPlugin,
} from '../../plugins-support.js';

export default class PluginsUnpublish extends BaseCommand {
  static override description =
    'Remove a plugin listing, or part of a deployment audience. Installations are untouched.';
  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
    scope: scopeFlag,
    ...audienceFlags,
  };

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(PluginsUnpublish);
      this.loadEnvironment(flags);
      this.writeJson(
        await unpublishPlugin(this.getAuthenticatedClient(), toPublishInput(args.repository, flags))
      );
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
