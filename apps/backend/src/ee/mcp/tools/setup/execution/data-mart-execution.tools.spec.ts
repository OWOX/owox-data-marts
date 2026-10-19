jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { z } from 'zod-v4';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import {
  GetDataMartRunTool,
  ListDataMartSchedulesTool,
  CancelDataMartRunTool,
  RunDataMartTool,
  SaveDataMartScheduleTool,
  DeleteDataMartScheduleTool,
} from './data-mart-execution.tools';
const dataMartId = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
const context = { ...actor, roles: ['admin'], scopes: ['mcp:read', 'mcp:write'] } as any;
const cases = [
  {
    Tool: RunDataMartTool,
    method: 'runDataMart',
    input: { dataMartId, expectedRevision: 1, operationId: 'run-1' },
    operation: 'live',
  },
  {
    Tool: SaveDataMartScheduleTool,
    method: 'saveSchedule',
    input: {
      dataMartId,
      expectedRevision: 1,
      operationId: 'create-1',
      cronExpression: '0 9 * * *',
      timeZone: 'UTC',
      enabled: true,
    },
    operation: 'mutation',
  },
  {
    Tool: DeleteDataMartScheduleTool,
    method: 'deleteSchedule',
    input: { dataMartId, scheduleId: runId, expectedRevision: 1, operationId: 'delete-1' },
    operation: 'mutation',
  },
  {
    Tool: GetDataMartRunTool,
    method: 'getRun',
    input: { dataMartId, runId },
    operation: 'stored-read',
  },
  {
    Tool: ListDataMartSchedulesTool,
    method: 'listSchedules',
    input: { dataMartId },
    operation: 'stored-read',
  },
  {
    Tool: CancelDataMartRunTool,
    method: 'cancelRun',
    input: { dataMartId, runId },
    operation: 'mutation',
  },
];
describe('Data Mart execution tools', () => {
  it.each(cases)(
    '$method rechecks admission on every direct invocation',
    async ({ Tool, method, input, operation }) => {
      const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
      const facade = { [method]: jest.fn().mockResolvedValue({ result: 'ok' }) };
      const tool = new Tool(authorization as any, facade as any);
      await tool.handler(input as any, context);
      expect(authorization.authorize).toHaveBeenCalledWith(context, operation);
      expect(facade[method]).toHaveBeenCalledWith({ ...input, ...actor });
      authorization.authorize.mockRejectedValue(new Error('revoked'));
      await expect(tool.handler(input as any, context)).rejects.toThrow('revoked');
      expect(facade[method]).toHaveBeenCalledTimes(1);
    }
  );
  it.each(cases)(
    '$method rejects supplied authority and arbitrary fields',
    async ({ Tool, method, input }) => {
      const facade = { [method]: jest.fn() };
      const tool = new Tool(
        { authorize: jest.fn().mockResolvedValue(actor) } as any,
        facade as any
      );
      await expect(
        tool.handler({ ...input, roles: ['admin'], payload: { token: 'SECRET' } } as any, context)
      ).rejects.toThrow();
      expect(facade[method]).not.toHaveBeenCalled();
    }
  );
  it('enforces both scopes for cancel with real admission, then detects revoked membership', async () => {
    const projects = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const authorization = new SetupAuthorizationService(projects as any);
    const facade = {
      cancelRun: jest.fn().mockResolvedValue({}),
      getRun: jest.fn().mockResolvedValue({}),
    };
    const cancel = new CancelDataMartRunTool(authorization, facade as any);
    const get = new GetDataMartRunTool(authorization, facade as any);
    await expect(
      cancel.handler({ dataMartId, runId }, { ...context, scopes: ['mcp:read'] })
    ).rejects.toThrow('Insufficient MCP scopes');
    expect(facade.cancelRun).not.toHaveBeenCalled();
    await get.handler({ dataMartId, runId }, { ...context, scopes: ['mcp:read'] });
    await cancel.handler({ dataMartId, runId }, context);
    projects.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await expect(cancel.handler({ dataMartId, runId }, context)).rejects.toThrow('current project');
    expect(facade.cancelRun).toHaveBeenCalledTimes(1);
    expect(cancel.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
  });
  it('strict outputs exclude raw diagnostics, credentials, definitions and arbitrary load parameters', () => {
    const tool = new GetDataMartRunTool({} as any, {} as any);
    expect(
      z
        .object(tool.outputSchema)
        .strict()
        .safeParse({ logs: ['SECRET'], definitionRun: {}, additionalParams: {} }).success
    ).toBe(false);
    expect(
      tool.outputSchema.diagnostics.safeParse({
        logsAvailable: true,
        errorsAvailable: false,
        content: 'withheld',
        logs: ['SECRET'],
      }).success
    ).toBe(false);
    const schedules = new ListDataMartSchedulesTool({} as any, {} as any);
    expect(
      schedules.outputSchema.schedules.element.shape.loadParameters.safeParse({
        mode: 'connector-default',
        configurable: false,
        token: 'SECRET',
      }).success
    ).toBe(false);
  });
});
