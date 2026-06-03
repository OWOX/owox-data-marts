export interface ProjectMemberApiKey {
  apiKeyId: string;
  name: string;
  expiresAt: string | null;
  createdAt: string;
  lastAuthenticatedAt: string | null;
}

export interface CreateProjectMemberApiKeyRequest {
  name: string;
  expiresAt?: string;
}

export interface CreateProjectMemberApiKeyResponse extends ProjectMemberApiKey {
  apiKey: string;
}

export interface UpdateProjectMemberApiKeyRequest {
  name: string;
}
