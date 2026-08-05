import { Flags } from '@oclif/core';
import type { OWOXPluginPublication, OWOXPluginPublicationScope } from '@owox/api-client';

import { BaseCommand } from '../../../base-command.js';
import type { PluginsClient } from '../../../plugins-support.js';

export async function listPublications(
  client: PluginsClient,
  scope: OWOXPluginPublicationScope
): Promise<OWOXPluginPublication[]> {
  return client.plugins.listPublications(scope);
}

export default class PluginsPublicationsList extends BaseCommand {
  static override description = 'List the publications you may manage at one authority level';
  static override flags = {
    ...BaseCommand.baseFlags,
    scope: Flags.string({
      description: 'Authority level to list',
      options: ['deployment', 'project', 'member'],
      required: true,
    }),
  };

  async run(): Promise<void> {
    try {
      const { flags } = await this.parse(PluginsPublicationsList);
      this.loadEnvironment(flags);
      this.writeJson(
        await listPublications(
          this.getAuthenticatedClient(),
          flags.scope as OWOXPluginPublicationScope
        )
      );
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
