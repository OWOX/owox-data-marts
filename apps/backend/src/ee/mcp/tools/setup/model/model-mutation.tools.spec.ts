jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import {
  ActualizeDataMartSchemaTool,
  UpdateDataMartSchemaTool,
  SetDataMartRelationshipsTool,
  SetDataMartAccessTool,
} from './model-mutation.tools';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
const id = '00000000-0000-4000-8000-000000000001';
const actor = { userId: 'actor', projectId: 'project', roles: ['editor'] };
const operations = [
  [ActualizeDataMartSchemaTool, 'actualizeSchema', {}],
  [
    UpdateDataMartSchemaTool,
    'updateSchema',
    { schema: { type: 'bigquery-data-mart-schema', fields: [] } },
  ],
  [
    SetDataMartRelationshipsTool,
    'setRelationships',
    { changes: [{ action: 'remove', relationshipId: id }] },
  ],
  [
    SetDataMartAccessTool,
    'setAccess',
    {
      mode: 'inspect',
      availability: { availableForReporting: false, availableForMaintenance: false },
    },
  ],
] as const;
it.each(operations)('authorizes and strictly maps %p', async (Tool, method, extra) => {
  const authorize = jest.fn().mockResolvedValue(actor);
  const model = {
    [method]: jest.fn().mockResolvedValue({ state: 'completed', dataMartId: id, revision: 2 }),
  };
  const tool = new Tool({ authorize } as never, model as never);
  const input = { dataMartId: id, expectedRevision: 1, ...extra };
  const result = await tool.handler(input as never, {} as never);
  expect(result.structuredContent).toMatchObject({ state: 'completed', revision: 2 });
  expect(authorize).toHaveBeenCalledWith({}, 'live');
  expect(model[method]).toHaveBeenCalledWith({ ...input, ...actor });
  expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
  await expect(
    tool.handler({ ...input, userId: 'forged' } as never, {} as never)
  ).rejects.toThrow();
  await expect(
    tool.handler({ ...input, expectedRevision: -1 } as never, {} as never)
  ).rejects.toThrow();
  expect(model[method]).toHaveBeenCalledTimes(1);
  authorize.mockRejectedValue(new Error('membership revoked'));
  await expect(tool.handler(input as never, {} as never)).rejects.toThrow('membership revoked');
  expect(model[method]).toHaveBeenCalledTimes(1);
});
it.each(operations)(
  'requires both actual grant scopes and current edit role for %p',
  async (Tool, method, extra) => {
    const projects = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const tool = new Tool(new SetupAuthorizationService(projects as never), {
      [method]: jest.fn(),
    } as never);
    const input = { dataMartId: id, expectedRevision: 1, ...extra };
    await expect(
      tool.handler(input as never, { ...actor, scopes: ['mcp:read'] } as never)
    ).rejects.toThrow('Insufficient MCP scopes');
    projects.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await expect(
      tool.handler(input as never, { ...actor, scopes: ['mcp:read', 'mcp:write'] } as never)
    ).rejects.toThrow('current project');
  }
);
