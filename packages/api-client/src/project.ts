import { OWOXApiError } from './errors.js';

export type OWOXProjectSettings = {
  description: string | null;
};

type ProjectRequester = {
  getJson<T>(path: string): Promise<T>;
  putJson<T>(path: string, jsonBody: unknown): Promise<T>;
};

function parseProjectSettings(response: unknown): OWOXProjectSettings {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('description' in response) ||
    (typeof response.description !== 'string' && response.description !== null)
  ) {
    throw new OWOXApiError('OWOX Project Settings API returned an unexpected response shape', {
      details: response,
    });
  }

  return { description: response.description };
}

export class ProjectApi {
  constructor(private readonly requester: ProjectRequester) {}

  async getSettings(): Promise<OWOXProjectSettings> {
    return parseProjectSettings(await this.requester.getJson<unknown>('/api/projects/settings'));
  }

  async updateDescription(description: string | null): Promise<OWOXProjectSettings> {
    return parseProjectSettings(
      await this.requester.putJson<unknown>('/api/projects/settings/description', { description })
    );
  }
}
