import { BaseCommand } from '../../base-command.js';
import { ConfigStore } from '../../config-store.js';
import { colors, renderJson } from '../../output.js';

type LogoutDeps = {
  store: ConfigStore;
};

export async function performLogout(
  deps: LogoutDeps = { store: new ConfigStore() }
): Promise<{ removed: boolean }> {
  return { removed: await deps.store.remove() };
}

export default class AuthLogout extends BaseCommand {
  static override description = 'Remove stored OWOX Data Marts credentials';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogout);

    try {
      this.loadEnvironment(flags);
      const result = await performLogout({ store: new ConfigStore() });
      if (this.outputFormat(flags) === 'json') {
        this.log(renderJson({ loggedOut: true, removed: result.removed }));
        return;
      }

      const palette = colors({ enabled: this.colorEnabled(flags) });
      this.log(
        result.removed
          ? palette.success('Stored credentials removed')
          : palette.warning('No stored credentials found')
      );
    } catch (error) {
      this.handleCliError(error, flags);
    }
  }
}
