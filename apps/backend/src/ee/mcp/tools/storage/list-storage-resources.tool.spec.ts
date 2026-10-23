import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { ListStorageResourcesTool } from './list-storage-resources.tool';

describe('ListStorageResourcesTool', () => {
  const facade = { listStorageResources: jest.fn() };
  const tool = new ListStorageResourcesTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('lists namespaces using trusted context and omits unrequested resource options', async () => {
    const namespaces = [{ id: 'project.dataset', label: 'Dataset' }, { id: 'project.archive' }];
    facade.listStorageResources.mockResolvedValue({ namespaces });

    const result = await tool.handler({ storage_id: 'storage-1', level: 'namespaces' }, mcpContext);

    expect(facade.listStorageResources).toHaveBeenCalledWith(setupContext, {
      storageId: 'storage-1',
      level: 'namespaces',
    });
    expect(facade.listStorageResources.mock.calls[0][1]).not.toHaveProperty('namespaceId');
    expect(facade.listStorageResources.mock.calls[0][1]).not.toHaveProperty('resourceType');
    expect(result.structuredContent).toEqual({ namespaces });
    expect(result.structuredContent).not.toHaveProperty('resources');
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ namespaces });
  });

  it('maps namespace and resource filters and preserves resource location metadata including false', async () => {
    const resources = [
      {
        id: 'orders',
        groupId: 'project.dataset',
        type: 'TABLE',
        fullyQualifiedName: 'project.dataset.orders',
        location: 'EU',
        locationMismatch: false,
      },
      {
        id: 'customers',
        groupId: 'project.dataset',
        type: 'VIEW',
        fullyQualifiedName: 'project.dataset.customers',
      },
    ];
    facade.listStorageResources.mockResolvedValue({ resources });

    const result = await tool.handler(
      {
        storage_id: 'storage-1',
        level: 'resources',
        namespace_id: 'project.dataset',
        resource_type: 'TABLE_PATTERN',
      },
      mcpContext
    );

    expect(facade.listStorageResources).toHaveBeenCalledWith(setupContext, {
      storageId: 'storage-1',
      level: 'resources',
      namespaceId: 'project.dataset',
      resourceType: 'TABLE_PATTERN',
    });
    expect(result.structuredContent).toStrictEqual({ resources });
    expect(result.structuredContent).not.toHaveProperty('namespaces');
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ resources });
  });

  it('returns an empty resource list without a resource filter', async () => {
    facade.listStorageResources.mockResolvedValue({ resources: [] });

    const result = await tool.handler(
      { storage_id: 'storage-1', level: 'resources', namespace_id: 'project.dataset' },
      mcpContext
    );

    expect(facade.listStorageResources).toHaveBeenCalledWith(setupContext, {
      storageId: 'storage-1',
      level: 'resources',
      namespaceId: 'project.dataset',
    });
    expect(facade.listStorageResources.mock.calls[0][1]).not.toHaveProperty('resourceType');
    expect(result.structuredContent).toEqual({ resources: [] });
  });

  it('requires namespace for leaf discovery before calling the facade', async () => {
    await expect(
      tool.handler({ storage_id: 'storage-1', level: 'resources' }, mcpContext)
    ).rejects.toThrow('namespace_id is required for level=resources');
    expect(facade.listStorageResources).not.toHaveBeenCalled();
  });

  it.each([
    { storage_id: '', level: 'namespaces' },
    { level: 'namespaces' },
    { storage_id: 'storage-1', level: 'tables' },
    { storage_id: 'storage-1', level: 'resources', namespace_id: '' },
    { storage_id: 'storage-1', level: 'namespaces', resource_type: 'FUNCTION' },
  ])('rejects invalid discovery input %j before calling the facade', async input => {
    await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
    expect(facade.listStorageResources).not.toHaveBeenCalled();
  });

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
  ])('rejects untrusted context override %j before discovery', async override => {
    await expect(
      tool.handler(
        { storage_id: 'storage-1', level: 'namespaces', ...override } as never,
        mcpContext
      )
    ).rejects.toThrow();
    expect(facade.listStorageResources).not.toHaveBeenCalled();
  });

  it('propagates access errors', async () => {
    const error = new ForbiddenException('Storage access denied');
    facade.listStorageResources.mockRejectedValueOnce(error);

    await expect(
      tool.handler({ storage_id: 'storage-1', level: 'namespaces' }, mcpContext)
    ).rejects.toBe(error);
  });

  it('advertises serializable raw shapes with read access', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(inputJson.properties).toHaveProperty('storage_id');
    expect(inputJson.properties).not.toHaveProperty('project_id');
    expect(outputJson.properties).toHaveProperty('namespaces');
    expect(outputJson.properties).toHaveProperty('resources');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    });
  });
});
