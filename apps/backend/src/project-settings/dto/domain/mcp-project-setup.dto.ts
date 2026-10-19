import type { ProjectStatus, Role } from '@owox/idp-protocol';

export interface McpProjectSetupRequest {
  projectId: string;
  userId: string;
  roles: Role[];
}

export interface McpProjectSetupDto {
  project: {
    id: string;
    title: string;
    status: ProjectStatus | null;
    roles: Role[];
    createdAt: string | null;
  };
  description: string | null;
  revision: number;
  canUpdateDescription: boolean;
}

export interface McpUpdateProjectDescriptionRequest extends McpProjectSetupRequest {
  description: string | null;
  expectedRevision: number;
}

export interface McpProjectDescriptionDto {
  description: string | null;
  revision: number;
}
