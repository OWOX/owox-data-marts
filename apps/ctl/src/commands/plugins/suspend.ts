import { Flags } from '@oclif/core';
import type { OWOXPluginSuspension } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';
import { repositoryArg, type PluginsClient } from '../../plugins-support.js';

export function suspendPlugin(
  client: PluginsClient,
  repository: string,
  note?: string
): Promise<OWOXPluginSuspension> {
  return client.plugins.suspend(repository, note);
}

export default class PluginsSuspend extends BaseCommand {
  static override description =
    'Suspend a plugin across the whole deployment. Blocks opening, installing and restoring; uninstalling and updating stay available.';

  static override args = repositoryArg;
  static override flags = {
    ...BaseCommand.baseFlags,
    note: Flags.string({ description: 'Why, for the audit trail' }),
  };

  async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(PluginsSuspend);
      this.loadEnvironment(flags);
      this.writeJson(
        await suspendPlugin(this.getAuthenticatedClient(), args.repository, flags.note)
      );
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
