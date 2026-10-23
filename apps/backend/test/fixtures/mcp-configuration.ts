import type { McpDataMartConfiguration } from '../../src/data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../src/ee/mcp/auth/mcp-auth-context';

export const mcpContext: McpAuthContext = {
  clientId: 'client-1',
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['editor'],
  resource: 'https://mcp.example/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};

export const setupContext = {
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['editor'],
};

export const dataMartConfiguration: McpDataMartConfiguration = {
  id: 'mart-1',
  title: 'Revenue',
  status: 'DRAFT',
  storage: { id: 'storage-1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
  definitionType: null,
  definition: null,
  description: null,
  icon: null,
  schema: null,
  businessOwnerIds: [],
  technicalOwnerIds: ['user-1'],
  availableForReporting: true,
  availableForMaintenance: false,
  contexts: [],
  blendedFieldsConfig: null,
  createdAt: '2026-10-21T00:00:00.000Z',
  modifiedAt: '2026-10-21T01:00:00.000Z',
};
