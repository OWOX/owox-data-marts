import type {
  ProjectMemberApiKey,
  CreateProjectMemberApiKeyRequest,
  CreateProjectMemberApiKeyResponse,
  UpdateProjectMemberApiKeyRequest,
} from '../types';

import { ApiService } from '../../../services';

class ProjectMemberApiKeysService extends ApiService {
  constructor() {
    super('/project-member-api-keys');
  }

  async getKeys(includeRevoked?: boolean): Promise<ProjectMemberApiKey[]> {
    return this.get<ProjectMemberApiKey[]>(
      '',
      includeRevoked ? { includeRevoked: 'true' } : undefined
    );
  }

  async createKey(
    payload: CreateProjectMemberApiKeyRequest
  ): Promise<CreateProjectMemberApiKeyResponse> {
    return this.post<CreateProjectMemberApiKeyResponse>('', payload);
  }

  async updateKey(
    apiKeyId: string,
    payload: UpdateProjectMemberApiKeyRequest
  ): Promise<ProjectMemberApiKey> {
    return this.patch<ProjectMemberApiKey>(`/${apiKeyId}`, payload);
  }

  async revokeKey(apiKeyId: string): Promise<void> {
    return this.delete(`/${apiKeyId}`);
  }
}

export const apiKeysService = new ProjectMemberApiKeysService();
