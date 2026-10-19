import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import {
  GetConnectorAuthoringSchemaTool,
  CreateCustomConnectorTool,
  UpdateCustomConnectorMetadataTool,
  SaveCustomConnectorDraftTool,
  TestCustomConnectorTool,
  PublishCustomConnectorTool,
  ActivateCustomConnectorVersionTool,
  DeleteCustomConnectorTool,
  ListCustomConnectorsTool,
  GetCustomConnectorSetupTool,
  ValidateCustomConnectorTool,
} from './custom-connectors.tools';
const connectorId = '77882409-f6f8-4243-8972-f0cf34898e02';
const context = {
  projectId: 'project',
  userId: 'user',
  roles: ['admin'],
  scopes: ['mcp:read'],
} as McpAuthContext;
describe('Custom Connector Setup tools', () => {
  const projections = { getProjectForUser: jest.fn() };
  const authorization = new SetupAuthorizationService(projections as never);
  const facade = {
    createConnector: jest.fn(),
    updateMetadata: jest.fn(),
    saveDraft: jest.fn(),
    testConnector: jest.fn(),
    publishConnector: jest.fn(),
    activateVersion: jest.fn(),
    deleteConnector: jest.fn(),
    getImpact: jest.fn(),
    getAuthoringSchema: jest.fn(),
    listConnectors: jest.fn(),
    getConnector: jest.fn(),
    validateConnector: jest.fn(),
  };
  beforeEach(() => {
    jest.resetAllMocks();
    projections.getProjectForUser.mockResolvedValue({
      id: 'project',
      roles: ['editor'],
      status: 'active',
    });
  });
  it.each([
    [GetConnectorAuthoringSchemaTool, {}, 'getAuthoringSchema'],
    [ListCustomConnectorsTool, {}, 'listConnectors'],
    [GetCustomConnectorSetupTool, { connectorId }, 'getConnector'],
    [ValidateCustomConnectorTool, { connectorId, version: 2 }, 'validateConnector'],
  ] as const)(
    'rechecks current membership and read scope inside %s',
    async (Tool, input, method) => {
      facade[method].mockResolvedValue({});
      const tool = new Tool(authorization, facade);
      expect(tool.requiredScopes).toEqual(['mcp:read']);
      await tool.handler(input as never, context);
      expect(facade[method]).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project', userId: 'user', roles: ['editor'] })
      );
      projections.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
      await expect(tool.handler(input as never, context)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(facade[method]).toHaveBeenCalledTimes(1);
      await expect(tool.handler(input as never, { ...context, scopes: [] })).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(facade[method]).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    { connectorId, version: 1, manifest: { token: 'literal-secret' } },
    { connectorId, version: 1, projectId: 'another-project' },
    { connectorId, version: 1, credentials: 'literal-secret' },
    { connectorId, version: 0 },
    { connectorId, version: 1.5 },
    { connectorId: 'not-uuid', version: 1 },
  ])('rejects model-supplied secrets, actor fields and invalid versions %j', async input => {
    await expect(
      new ValidateCustomConnectorTool(authorization, facade).handler(input as never, context)
    ).rejects.toThrow();
    expect(facade.validateConnector).not.toHaveBeenCalled();
  });
  it('uses explicit output schema and only accepts a stored version for validation', async () => {
    const dto = {
      connectorId,
      revision: 1,
      version: 2,
      status: 'draft',
      valid: false,
      assessment: 'static_known_positions_only',
      issues: [{ code: 'literal_auth_secret', message: 'Remove literal credential values.' }],
    };
    facade.validateConnector.mockResolvedValue(dto);
    const tool = new ValidateCustomConnectorTool(authorization, facade);
    const result = await tool.handler({ connectorId, version: 2 }, context);
    expect(z.object(tool.outputSchema).strict().parse(result.structuredContent)).toEqual(dto);
    expect(facade.validateConnector).toHaveBeenCalledWith({
      connectorId,
      version: 2,
      projectId: 'project',
      userId: 'user',
      roles: ['editor'],
    });
  });
  it('parses pagination inside direct calls and rejects unknown fields', async () => {
    facade.listConnectors.mockResolvedValue({ items: [], hasMore: false });
    const tool = new ListCustomConnectorsTool(authorization, facade);
    await tool.handler({}, context);
    expect(facade.listConnectors).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      projectId: 'project',
      userId: 'user',
      roles: ['editor'],
    });
    await expect(tool.handler({ limit: 101 }, context)).rejects.toThrow();
    await expect(tool.handler({ userId: 'supplied' } as never, context)).rejects.toThrow();
    await expect(
      new GetConnectorAuthoringSchemaTool(authorization, facade).handler(
        { secret: 'value' } as never,
        context
      )
    ).rejects.toThrow();
  });
  it.each([
    [
      CreateCustomConnectorTool,
      { operationId: 'create', name: 'Source', title: 'Source', manifest: {} },
      'createConnector',
    ],
    [
      UpdateCustomConnectorMetadataTool,
      { connectorId, expectedRevision: 1, title: 'changed' },
      'updateMetadata',
    ],
    [
      SaveCustomConnectorDraftTool,
      { connectorId, expectedRevision: 1, preparationId: connectorId, manifest: {} },
      'saveDraft',
    ],
    [
      TestCustomConnectorTool,
      {
        connectorId,
        expectedRevision: 1,
        operationId: 'test',
        approvalId: connectorId,
        version: 1,
        node: 'items',
      },
      'testConnector',
    ],
    [
      PublishCustomConnectorTool,
      {
        connectorId,
        expectedRevision: 1,
        operationId: 'publish',
        preparationId: connectorId,
        impactDigest: 'a'.repeat(64),
        version: 1,
      },
      'publishConnector',
    ],
    [
      ActivateCustomConnectorVersionTool,
      {
        connectorId,
        expectedRevision: 1,
        operationId: 'activate',
        version: 1,
        impactDigest: 'a'.repeat(64),
      },
      'activateVersion',
    ],
    [
      DeleteCustomConnectorTool,
      { connectorId, expectedRevision: 1, operationId: 'delete', impactDigest: 'a'.repeat(64) },
      'deleteConnector',
    ],
  ] as const)(
    'requires write scope and current membership for %s and passes only the verified actor',
    async (Tool, input, method) => {
      facade[method].mockResolvedValue({ connectorId, revision: 2, outcome: 'completed' });
      const tool = new Tool(authorization, facade);
      await expect(tool.handler(input as never, context)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(facade[method]).not.toHaveBeenCalled();
      const result = await tool.handler(input as never, {
        ...context,
        scopes: ['mcp:read', 'mcp:write'],
      });
      expect(z.object(tool.outputSchema).strict().parse(result.structuredContent)).toMatchObject({
        revision: 2,
      });
      expect(facade[method]).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project', userId: 'user', roles: ['editor'] })
      );
      await expect(
        tool.handler({ ...input, userId: 'forged' } as never, {
          ...context,
          scopes: ['mcp:read', 'mcp:write'],
        })
      ).rejects.toThrow();
      expect(facade[method]).toHaveBeenCalledTimes(1);
    }
  );
});
