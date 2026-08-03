import { BaseCommand } from '../../base-command.js';
import {
  audienceFlags,
  installationHint,
  publishPlugin,
  repositoryArg,
  scopeFlag,
  toPublishInput,
} from '../../plugins-support.js';

export default class PluginsPublish extends BaseCommand {
  static override description = 'Publish a plugin to the Gallery at one authority level';
  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
    scope: scopeFlag,
    ...audienceFlags,
  };

  static override examples = [
    '<%= config.bin %> <%= command.id %> https://github.com/OWOX/example-plugin --scope member',
    '<%= config.bin %> <%= command.id %> OWOX/example-plugin --scope deployment --project-id p1 --project-id p2',
    '<%= config.bin %> <%= command.id %> OWOX/example-plugin --scope deployment --all-projects',
  ];

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(PluginsPublish);
      this.loadEnvironment(flags);
      this.writeJson(
        await publishPlugin(this.getAuthenticatedClient(), toPublishInput(args.repository, flags))
      );
    } catch (error) {
      const hint = installationHint(error);
      if (hint) {
        process.stderr.write(`${hint}\n`);
      }
      this.handleCliError(error);
    }
  }
}
