jest.mock('../../observability/log-mcp-tool-error', () => ({ logMcpToolError: jest.fn() }));
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { RunDataMartTool } from './run-data-mart.tool';
import { GetDataMartRunTool } from './get-data-mart-run.tool';
import { ListDataMartRunsTool } from './list-data-mart-runs.tool';
import { CancelDataMartRunTool } from './cancel-data-mart-run.tool';
import { ListDataMartRunSchedulesTool } from './list-data-mart-run-schedules.tool';
import { CreateDataMartRunScheduleTool } from './create-data-mart-run-schedule.tool';
import { UpdateDataMartRunScheduleTool } from './update-data-mart-run-schedule.tool';
import { DeleteDataMartRunScheduleTool } from './delete-data-mart-run-schedule.tool';
import { runDataMartSchema, createDataMartRunScheduleSchema } from './data-mart-execution.schemas';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { updateDataMartRunScheduleSchema } from './data-mart-execution.schemas';
const context = { projectId: 'project', userId: 'user', roles: ['editor'] } as McpAuthContext;
const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
describe('Data Mart execution tools', () => {
  it.each([
    [
      RunDataMartTool,
      'run',
      { data_mart_id: 'dm' },
      { dataMartId: 'dm' },
      { dataMartId: 'dm', runId: 'run', status: 'queued' },
      { data_mart_id: 'dm', run_id: 'run', status: 'queued' },
    ],
    [
      GetDataMartRunTool,
      'getRun',
      { data_mart_id: 'dm', run_id: 'run' },
      { dataMartId: 'dm', runId: 'run' },
      {
        runId: 'run',
        dataMartId: 'dm',
        status: 'FAILED',
        type: 'CONNECTOR',
        runType: 'manual',
        createdAt: 'now',
        startedAt: null,
        finishedAt: null,
        errorSummary: 'The run failed. Open its Run History in OWOX to see details.',
        shouldPoll: false,
      },
      {
        run_id: 'run',
        status: 'FAILED',
        should_poll: false,
        error_summary: 'The run failed. Open its Run History in OWOX to see details.',
      },
    ],
    [
      ListDataMartRunsTool,
      'listRuns',
      { data_mart_id: 'dm' },
      { dataMartId: 'dm', limit: 50, offset: 0 },
      [],
      { runs: [] },
    ],
    [
      CancelDataMartRunTool,
      'cancelRun',
      { data_mart_id: 'dm', run_id: 'run' },
      { dataMartId: 'dm', runId: 'run' },
      { dataMartId: 'dm', runId: 'run', cancellationApplied: true },
      { data_mart_id: 'dm', run_id: 'run', cancellation_applied: true },
    ],
    [
      ListDataMartRunSchedulesTool,
      'listSchedules',
      { data_mart_id: 'dm' },
      { dataMartId: 'dm' },
      [],
      { schedules: [] },
    ],
    [
      CreateDataMartRunScheduleTool,
      'createSchedule',
      { data_mart_id: 'dm', cron_expression: '0 9 * * *' },
      { dataMartId: 'dm', cronExpression: '0 9 * * *', timeZone: 'UTC', isActive: true },
      {
        dataMartId: 'dm',
        triggerId: 'trigger',
        cronExpression: '0 9 * * *',
        timeZone: 'UTC',
        isActive: true,
        nextRunAt: null,
        lastRunAt: null,
      },
      { trigger_id: 'trigger', data_mart_id: 'dm', is_active: true },
    ],
    [
      UpdateDataMartRunScheduleTool,
      'updateSchedule',
      { data_mart_id: 'dm', trigger_id: 'trigger', cron_expression: '0 9 * * *', is_active: false },
      { dataMartId: 'dm', triggerId: 'trigger', cronExpression: '0 9 * * *', isActive: false },
      {
        dataMartId: 'dm',
        triggerId: 'trigger',
        cronExpression: '0 9 * * *',
        timeZone: 'UTC',
        isActive: false,
        nextRunAt: null,
        lastRunAt: null,
      },
      { trigger_id: 'trigger', is_active: false },
    ],
    [
      DeleteDataMartRunScheduleTool,
      'deleteSchedule',
      { data_mart_id: 'dm', trigger_id: 'trigger' },
      { dataMartId: 'dm', triggerId: 'trigger' },
      { dataMartId: 'dm', triggerId: 'trigger' },
      { data_mart_id: 'dm', trigger_id: 'trigger' },
    ],
  ] as const)(
    '%p maps only safe input and output through its facade',
    async (Tool, method, input, expectedInput, output, expectedOutput) => {
      const call = jest.fn().mockResolvedValue({ ...output, credentials: 'secret' });
      // Lists return arrays, not objects.
      if (Array.isArray(output)) call.mockResolvedValue(output);
      const tool = new Tool({ [method]: call } as never);
      const result = await tool.handler(input as never, context);
      expect(call).toHaveBeenCalledWith(actor, expectedInput);
      expect(result.structuredContent).toMatchObject(expectedOutput);
      expect(JSON.stringify(result)).not.toContain('secret');
      expect(() =>
        (tool.zodSchema as typeof runDataMartSchema).parse({ ...input, project_id: 'other' })
      ).toThrow();
      await expect(
        tool.handler({ ...input, roles: ['admin'] } as never, context)
      ).rejects.toThrow();
    }
  );
  it.each([
    new Error('provider secret'),
    new BadRequestException('provider secret'),
    new ForbiddenException('provider secret'),
    new NotFoundException('provider secret'),
    new ConflictException('provider secret'),
  ])('does not expose raw failures: %p', async error => {
    const tool = new RunDataMartTool({ run: jest.fn().mockRejectedValue(error) } as never);
    const caught = await tool.handler({ data_mart_id: 'dm' }, context).catch(value => value);
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).not.toContain('secret');
    expect(JSON.stringify(caught.getResponse())).not.toContain('secret');
  });
  it.each([
    'Only published data marts can be run manually',
    'Invalid cron expression or timezone',
    'Cannot create a trigger for a data mart that is not published',
  ])('preserves an actionable execution failure: %s', async message => {
    const tool = new RunDataMartTool({
      run: jest
        .fn()
        .mockRejectedValue(new BusinessViolationException(message, { token: 'secret' })),
    } as never);
    const error = await tool.handler({ data_mart_id: 'dm' }, context).catch(value => value);
    expect(error.message).toBe(message);
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
  });
  it('returns safe chain metadata through get and list, so segment one is not the whole backfill', async () => {
    const output = {
      runId: 'run-1',
      dataMartId: 'dm',
      status: 'SUCCESS',
      type: 'CONNECTOR',
      runType: 'manual',
      createdAt: 'now',
      startedAt: null,
      finishedAt: 'now',
      errorSummary: null,
      shouldPoll: false,
      backfill: { chainId: 'chain-1', segmentIndex: 1, segmentsTotal: 3, token: 'secret' },
    };
    const get = new GetDataMartRunTool({ getRun: jest.fn().mockResolvedValue(output) } as never);
    const list = new ListDataMartRunsTool({
      listRuns: jest.fn().mockResolvedValue([output]),
    } as never);
    const expected = { chain_id: 'chain-1', segment_index: 1, segments_total: 3 };
    expect(
      (await get.handler({ data_mart_id: 'dm', run_id: 'run-1' }, context)).structuredContent
    ).toMatchObject({ status: 'SUCCESS', should_poll: false, backfill: expected });
    const result = await list.handler({ data_mart_id: 'dm' } as never, context);
    expect(result.structuredContent).toMatchObject({ runs: [{ backfill: expected }] });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('advertises the requested tool names', () => {
    const tools = [
      RunDataMartTool,
      GetDataMartRunTool,
      ListDataMartRunsTool,
      CancelDataMartRunTool,
      ListDataMartRunSchedulesTool,
      CreateDataMartRunScheduleTool,
      UpdateDataMartRunScheduleTool,
      DeleteDataMartRunScheduleTool,
    ];
    expect(tools.map(Tool => new Tool({} as never).name)).toEqual([
      'run_data_mart',
      'get_data_mart_run',
      'list_data_mart_runs',
      'cancel_data_mart_run',
      'list_data_mart_run_schedules',
      'create_data_mart_run_schedule',
      'update_data_mart_run_schedule',
      'delete_data_mart_run_schedule',
    ]);
  });
  it('matches HTTP roles while keeping write and read scopes distinct', () => {
    for (const Tool of [RunDataMartTool, CancelDataMartRunTool]) {
      const tool = new Tool({} as never);
      expect(tool.requiredRole).toBe('editor');
      expect(tool.requiredScopes).toContain('mcp:write');
    }
    for (const Tool of [
      CreateDataMartRunScheduleTool,
      UpdateDataMartRunScheduleTool,
      DeleteDataMartRunScheduleTool,
    ]) {
      const tool = new Tool({} as never);
      expect(tool.requiredRole).toBe('viewer');
      expect(tool.requiredScopes).toContain('mcp:write');
    }
    for (const Tool of [GetDataMartRunTool, ListDataMartRunsTool, ListDataMartRunSchedulesTool]) {
      const tool = new Tool({} as never);
      expect(tool.requiredRole).toBe('viewer');
      expect(tool.requiredScopes).toEqual(['mcp:read']);
    }
  });
});
describe('Data Mart execution schemas', () => {
  it.each([
    [{ StartDate: 'password=secret' }, 'StartDate is not a valid date.'],
    [
      { StartDate: '2026-02-01', EndDate: '2026-01-01' },
      'EndDate cannot be earlier than StartDate.',
    ],
    [{ StartDate: '9999-01-01' }, 'StartDate cannot be in the future.'],
  ])('reports the backfill field and cause without echoing input', (data, expected) => {
    const result = runDataMartSchema.safeParse({
      data_mart_id: 'dm',
      payload: { runType: 'MANUAL_BACKFILL', data },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].message).toContain(expected);
    expect(result.error.issues[0].message).not.toContain('secret');
  });
  it.each([createDataMartRunScheduleSchema, updateDataMartRunScheduleSchema])(
    'bounds schedule expression and timezone input',
    schema => {
      const base = {
        data_mart_id: 'dm',
        ...(schema === updateDataMartRunScheduleSchema ? { trigger_id: 'trigger' } : {}),
        cron_expression: '0 9 * * *',
        time_zone: 'UTC',
      };
      expect(schema.safeParse(base).success).toBe(true);
      expect(schema.safeParse({ ...base, cron_expression: 'x'.repeat(256) }).success).toBe(false);
      expect(schema.safeParse({ ...base, time_zone: 'x'.repeat(101) }).success).toBe(false);
    }
  );
  it('accepts current connector run modes and connector-specific data', () => {
    expect(
      runDataMartSchema.parse({
        data_mart_id: 'dm',
        payload: {
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2026-01-01', EndDate: '2026-02-01', CustomField: true },
        },
      }).payload?.runType
    ).toBe('MANUAL_BACKFILL');
    expect(runDataMartSchema.parse({ data_mart_id: 'dm', payload: {} }).payload).toEqual({});
  });
  it.each([
    { payload: { runType: 'scheduled' } },
    { payload: { credentials: {} } },
    { payload: { data: [] } },
    { payload: { runType: 'MANUAL_BACKFILL', data: { StartDate: 'invalid' } } },
    {
      payload: {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-02-01', EndDate: '2026-01-01' },
      },
    },
    { payload: { data: { value: 'x'.repeat(1024 * 1024) } } },
  ])('rejects invalid or oversized run payload', extra => {
    expect(runDataMartSchema.safeParse({ data_mart_id: 'dm', ...extra }).success).toBe(false);
  });
  it('leaves schedule validity to the shared HTTP use case, including inactive cron behavior', () => {
    expect(
      createDataMartRunScheduleSchema.safeParse({
        data_mart_id: 'dm',
        cron_expression: 'bad',
        is_active: false,
      }).success
    ).toBe(true);
    expect(
      createDataMartRunScheduleSchema.safeParse({
        data_mart_id: 'dm',
        cron_expression: '0 9 * * *',
        time_zone: 'invalid',
      }).success
    ).toBe(true);
  });
});
