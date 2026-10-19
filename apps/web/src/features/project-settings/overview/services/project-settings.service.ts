import { ApiService } from '../../../../services';
import type { ProjectSettings, UpdateProjectDescriptionRequest } from '../types';

export class ProjectSettingsApiService extends ApiService {
  constructor() {
    super('/projects/settings');
  }

  async getSettings(): Promise<ProjectSettings> {
    return this.get<ProjectSettings>('');
  }

  async updateDescription(
    description: string | null,
    expectedRevision: number
  ): Promise<ProjectSettings> {
    const request: UpdateProjectDescriptionRequest = { description, expectedRevision };
    return this.put<ProjectSettings>('/description', request);
  }
}

export const projectSettingsApiService = new ProjectSettingsApiService();
