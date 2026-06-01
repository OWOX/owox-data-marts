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
    try {
      const { flags } = await this.parse(StoragesList);
      this.loadEnvironment(flags);
      this.writeJson(await listStorages(this.getAuthenticatedClient()));
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
