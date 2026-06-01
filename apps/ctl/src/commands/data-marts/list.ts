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
    try {
      const { flags } = await this.parse(DataMartsList);
      this.loadEnvironment(flags);
      this.writeJson(await listDataMarts(this.getAuthenticatedClient()));
    } catch (error) {
      this.handleCliError(error);
    }
  }
}
