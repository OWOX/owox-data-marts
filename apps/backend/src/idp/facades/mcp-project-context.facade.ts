import type { ProjectStatus, Role } from '@owox/idp-protocol';

export const MCP_PROJECT_CONTEXT_FACADE = Symbol('MCP_PROJECT_CONTEXT_FACADE');

export interface McpProjectContextRequest {
  userId: string;
  projectId: string;
  roles: Role[];
}

export interface McpProjectContext {
  id: string;
  title: string;
  status?: ProjectStatus;
  roles: Role[];
  createdAt?: string;
}

export interface McpProjectContextResponse {
  project: McpProjectContext;
}

export interface McpProjectContextFacade {
  getProjectContext(request: McpProjectContextRequest): Promise<McpProjectContextResponse>;
}
