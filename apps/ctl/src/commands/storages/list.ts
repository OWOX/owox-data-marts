import type { OWOXApiClient, OWOXStorage } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';

export async function listStorages(
  client: Pick<OWOXApiClient, 'storages'>
): Promise<OWOXStorage[]> {
  return client.storages.list();
}

export default class StoragesList extends BaseCommand {
  static override description = 'List storages';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StoragesList);

    try {
      this.loadEnvironment(flags);
      const rows = await listStorages(await this.getAuthenticatedClient());
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
