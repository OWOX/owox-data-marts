import type { JsonRequester } from './data-marts.js';
import { OWOXApiError } from './errors.js';

export type OWOXDestination = Record<string, unknown> & {
  id: string;
  title: string;
  type: string;
};

export class DestinationsApi {
  constructor(private readonly requester: JsonRequester) {}

  async list(): Promise<OWOXDestination[]> {
    const response = await this.requester.getJson<unknown>('/api/data-destinations');

    if (!Array.isArray(response)) {
      throw new OWOXApiError('OWOX Data Destinations API returned an unexpected response shape', {
        details: response,
      });
    }

    return response as OWOXDestination[];
  }
}
