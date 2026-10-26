import type { McpAuthContext } from '../../src/ee/mcp/auth/mcp-auth-context';
import type { McpProjectActor } from '../../src/data-marts/facades/mcp-contexts.facade';

export const adminMcpContext: McpAuthContext = {
  clientId: 'client-1',
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['admin'],
  resource: 'https://mcp.example/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};

export const mcpProjectActor: McpProjectActor = {
  projectId: 'project-1',
  userId: 'user-1',
};
