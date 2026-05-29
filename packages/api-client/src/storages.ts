import type { JsonRequester } from './data-marts.js';
import { OWOXApiError } from './errors.js';

export type OWOXStorage = Record<string, unknown> & {
  id: string;
  title: string;
  type: string;
};

export class StoragesApi {
  constructor(private readonly requester: JsonRequester) {}

  async list(): Promise<OWOXStorage[]> {
    const response = await this.requester.getJson<unknown>('/api/data-storages');

    if (!Array.isArray(response)) {
      throw new OWOXApiError('OWOX Data Storages API returned an unexpected response shape', {
        details: response,
      });
    }

    return response as OWOXStorage[];
  }
}
