import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import {
  GetConnectorSetupRequirementsTool,
  ListSetupConnectorsTool,
  ListSetupStoragesTool,
  ListStorageResourcesTool,
} from './setup-discovery.tools';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
const storageId = '77882409-f6f8-4243-8972-f0cf34898e02';
const context = { projectId: 'project', userId: 'user', scopes: ['mcp:read'] } as McpAuthContext;
describe('Setup discovery handlers', () => {
  const projections = { getProjectForUser: jest.fn() };
  const authorization = new SetupAuthorizationService(projections as never);
  const facade = {
    listStorages: jest.fn(),
    listStorageResources: jest.fn(),
    listConnectors: jest.fn(),
    getConnectorRequirements: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    projections.getProjectForUser.mockResolvedValue({
      id: 'project',
      roles: ['editor'],
      status: 'active',
    });
  });
  it('denies read-only live discovery before any domain or IdP work', async () => {
    const tool = new ListStorageResourcesTool(authorization, facade);
    await expect(tool.handler({ storageId, level: 'namespaces' }, context)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(facade.listStorageResources).not.toHaveBeenCalled();
    expect(projections.getProjectForUser).not.toHaveBeenCalled();
  });
  it('rechecks current roles even with both scopes', async () => {
    projections.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await expect(
      new ListStorageResourcesTool(authorization, facade).handler(
        { storageId, level: 'namespaces' },
        { ...context, scopes: ['mcp:read', 'mcp:write'] }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(facade.listStorageResources).not.toHaveBeenCalled();
  });
  it('uses authorized actor fields and bounded input for live work', async () => {
    facade.listStorageResources.mockResolvedValue({ source: 'live', items: [], hasMore: false });
    const tool = new ListStorageResourcesTool(authorization, facade);
    const result = await tool.handler(
      { storageId, level: 'namespaces', limit: 3 },
      { ...context, scopes: ['mcp:read', 'mcp:write'] }
    );
    expect(facade.listStorageResources).toHaveBeenCalledWith({
      storageId,
      level: 'namespaces',
      limit: 3,
      offset: 0,
      projectId: 'project',
      userId: 'user',
      roles: ['editor'],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });
  it.each([
    { storageId: 'invalid', level: 'namespaces' },
    { storageId, level: 'resources' },
    { storageId, level: 'namespaces', projectId: 'other' },
    { storageId, level: 'namespaces', limit: 101 },
  ])('rejects invalid or actor-supplied input %j', async input => {
    await expect(
      new ListStorageResourcesTool(authorization, facade).handler(input as never, {
        ...context,
        scopes: ['mcp:read', 'mcp:write'],
      })
    ).rejects.toThrow();
    expect(facade.listStorageResources).not.toHaveBeenCalled();
  });
  it.each([
    [ListSetupStoragesTool, {}, 'listStorages'],
    [ListSetupConnectorsTool, { storageId }, 'listConnectors'],
    [
      GetConnectorSetupRequirementsTool,
      { storageId, connectorName: 'Example' },
      'getConnectorRequirements',
    ],
  ] as const)('authorizes stored metadata using read scope (%s)', async (Tool, input, method) => {
    facade[method].mockResolvedValue({ items: [], hasMore: false });
    await new Tool(authorization, facade).handler(input as never, context);
    expect(facade[method]).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project', userId: 'user', roles: ['editor'] })
    );
    expect(projections.getProjectForUser).toHaveBeenCalledWith('user', 'project');
  });
});
