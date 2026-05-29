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
      const rows = await listDestinations(await this.getAuthenticatedClient());
      this.writeRows(
        rows,
        [
          { key: 'id', label: 'ID' },
          { key: 'title', label: 'Title' },
          { key: 'type', label: 'Type' },
        ],
        flags
      );
    } catch (error) {
      this.handleCliError(error, flags);
    }
  }
}
