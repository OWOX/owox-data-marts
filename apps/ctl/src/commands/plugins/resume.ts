import { Flags } from '@oclif/core';
import type { OWOXPluginSuspension } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';
import { repositoryArg, type PluginsClient } from '../../plugins-support.js';

export function resumePlugin(
  client: PluginsClient,
  repository: string,
  note?: string
): Promise<OWOXPluginSuspension> {
  return client.plugins.resume(repository, note);
}

export default class PluginsResume extends BaseCommand {
  static override description =
    'Lift a suspension. Re-enables active installations on whatever version is current now.';

  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
    note: Flags.string({ description: 'Why, for the audit trail' }),
  };

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(PluginsResume);
      this.loadEnvironment(flags);
      this.writeJson(
        await resumePlugin(this.getAuthenticatedClient(), args.repository, flags.note)
      );
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
