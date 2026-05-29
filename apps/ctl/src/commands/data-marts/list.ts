import type { OWOXApiClient, OWOXDataMart } from '@owox/api-client';

import { BaseCommand } from '../../base-command.js';

export async function listDataMarts(
  client: Pick<OWOXApiClient, 'dataMarts'>
): Promise<OWOXDataMart[]> {
  return client.dataMarts.list();
}

export default class DataMartsList extends BaseCommand {
  static override description = 'List data marts';
  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DataMartsList);

    try {
      this.loadEnvironment(flags);
      const rows = await listDataMarts(await this.getAuthenticatedClient());
      this.writeRows(
        rows,
        [
          { key: 'id', label: 'ID' },
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status' },
        ],
        flags
      );
    } catch (error) {
      this.handleCliError(error, flags);
    }
  }
}
