jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { z } from 'zod-v4';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import {
  ListSetupDataMartsTool,
  GetDataMartSetupTool,
  ValidateDataMartTool,
  GetDataMartChangeImpactTool,
} from './data-mart-setup.tools';

const id = '00000000-0000-4000-8000-000000000001';
const context = {} as any;
const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
describe('Data Mart setup tools', () => {
  const cases = [
    { Tool: ListSetupDataMartsTool, method: 'list', input: {}, operation: 'stored-read' },
    {
      Tool: GetDataMartSetupTool,
      method: 'get',
      input: { dataMartId: id },
      operation: 'stored-read',
    },
    {
      Tool: ValidateDataMartTool,
      method: 'validate',
      input: { dataMartId: id },
      operation: 'stored-read',
    },
    {
      Tool: GetDataMartChangeImpactTool,
      method: 'impact',
      input: { dataMartId: id, action: 'delete' },
      operation: 'stored-read',
    },
  ];
  it.each(cases)(
    '$method authorizes every direct invocation and ignores token role claims',
    async ({ Tool, method, input, operation }) => {
      const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
      const facade = { [method]: jest.fn().mockResolvedValue({ result: 'ok' }) };
      const tool = new Tool(authorization as any, facade as any);
      await tool.handler(input as any, context);
      expect(authorization.authorize).toHaveBeenCalledWith(context, operation);
      expect(facade[method]).toHaveBeenCalledWith(expect.objectContaining(actor));
      authorization.authorize.mockRejectedValue(new Error('revoked'));
      await expect(tool.handler(input as any, context)).rejects.toThrow('revoked');
      expect(facade[method]).toHaveBeenCalledTimes(1);
      expect(tool.outputSchema).toBeDefined();
    }
  );
  it.each(cases)(
    '$method rejects model-supplied authority and unknown inputs',
    async ({ Tool, method, input }) => {
      const facade = { [method]: jest.fn() };
      const tool = new Tool(
        { authorize: jest.fn().mockResolvedValue(actor) } as any,
        facade as any
      );
      await expect(
        tool.handler({ ...input, projectId: 'foreign', roles: ['admin'] } as any, context)
      ).rejects.toThrow();
      expect(facade[method]).not.toHaveBeenCalled();
    }
  );
  it('live validation always asks for both scopes while static uses stored admission', async () => {
    const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
    const facade = { validate: jest.fn().mockResolvedValue({}) };
    const tool = new ValidateDataMartTool(authorization as any, facade as any);
    await tool.handler({ dataMartId: id, mode: 'live' }, context);
    expect(authorization.authorize).toHaveBeenCalledWith(context, 'live');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    await expect(
      tool.handler({ dataMartId: id, mode: 'external' } as any, context)
    ).rejects.toThrow();
  });
  it('uses real scope admission and rechecks changed project membership on each invocation', async () => {
    const projects = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const facade = {
      validate: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({}),
    };
    const authorization = new SetupAuthorizationService(projects as any);
    const validate = new ValidateDataMartTool(authorization, facade as any);
    const get = new GetDataMartSetupTool(authorization, facade as any);
    const readContext = {
      userId: 'user',
      projectId: 'project',
      scopes: ['mcp:read'],
      roles: ['admin'],
    } as any;
    await expect(validate.handler({ dataMartId: id, mode: 'live' }, readContext)).rejects.toThrow(
      'Insufficient MCP scopes'
    );
    expect(facade.validate).not.toHaveBeenCalled();
    await validate.handler({ dataMartId: id, mode: 'static' }, readContext);
    await get.handler({ dataMartId: id }, readContext);
    projects.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await expect(get.handler({ dataMartId: id }, readContext)).rejects.toThrow('current project');
    expect(facade.get).toHaveBeenCalledTimes(1);
  });
  it('output schema rejects raw configuration and internal entity fields', () => {
    const tool = new GetDataMartSetupTool({} as any, {} as any);
    const definition = (tool.outputSchema as any).definition;
    expect(
      definition.safeParse({
        type: 'CONNECTOR',
        connectorName: 'x',
        node: 'x',
        fields: ['id'],
        version: null,
        fullyQualifiedName: 'p.d.t',
        configurationCount: 1,
        configuration: [{ token: 'SECRET' }],
      }).success
    ).toBe(false);
    expect(
      z
        .object(tool.outputSchema)
        .strict()
        .safeParse({ connectorState: { token: 'SECRET' } }).success
    ).toBe(false);
  });
});
