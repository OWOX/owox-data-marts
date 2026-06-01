import type { OWOXApiClient, OWOXDestination } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';

export async function listDestinations(
  client: Pick<OWOXApiClient, 'destinations'>
): Promise<OWOXDestination[]> {
  return client.destinations.list();
}

export default class DestinationsList extends BaseCommand {
  static override description = 'List destinations';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DestinationsList);

    try {
      this.loadEnvironment(flags);
      this.writeJson(await listDestinations(this.getAuthenticatedClient()));
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
