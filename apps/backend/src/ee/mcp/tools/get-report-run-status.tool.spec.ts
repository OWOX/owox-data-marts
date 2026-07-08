import type { McpReportsFacade } from '../../../data-marts/facades/mcp-reports.facade';
import type { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { GetReportRunStatusTool } from './get-report-run-status.tool';
import { McpToolRegistry } from './mcp-tool.registry';
import { MCP_TOOL_PROVIDER_CLASSES } from './mcp-tool.providers';

describe('GetReportRunStatusTool', () => {
  const NOW = Date.parse('2026-07-01T10:00:00.000Z');
  const systemTimeService = {
    now: jest.fn(() => new Date(NOW)),
  } as unknown as jest.Mocked<SystemTimeService>;

  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read', 'mcp:write'],
    authFlow: 'mcp',
  };

  it('gets a report run status using token project-member context', async () => {
    const facade = {
      getReportRunStatus: jest.fn().mockResolvedValue({
        reportId: 'report-1',
        runId: 'run-1',
        status: 'success',
        queuedAt: '2026-07-01T09:59:00.000Z',
        startedAt: '2026-07-01T10:00:00.000Z',
        rawStatus: 'SUCCESS',
        error: null,
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new GetReportRunStatusTool(facade, systemTimeService);

    const structuredContent = {
      report_id: 'report-1',
      run_id: 'run-1',
      status: 'success',
      should_poll: false,
      stop_reason: null,
      queued_at: '2026-07-01T09:59:00.000Z',
      started_at: '2026-07-01T10:00:00.000Z',
      raw_status: 'SUCCESS',
      error: null,
      message: null,
    };

    await expect(
      tool.handler({ report_id: 'report-1', run_id: 'run-1' }, context)
    ).resolves.toEqual({
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    });
    expect(facade.getReportRunStatus).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      reportId: 'report-1',
      runId: 'run-1',
    });
  });

  function runningFacade(options: {
    startedAt: string | null;
    queuedAt?: string | null;
    rawStatus?: string;
  }): jest.Mocked<McpReportsFacade> {
    return {
      getReportRunStatus: jest.fn().mockResolvedValue({
        reportId: 'report-1',
        runId: 'run-1',
        status: 'running',
        queuedAt: options.queuedAt === undefined ? '2026-07-01T09:59:00.000Z' : options.queuedAt,
        startedAt: options.startedAt,
        rawStatus: options.rawStatus ?? (options.startedAt ? 'RUNNING' : 'PENDING'),
        error: null,
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
  }

  async function runningMessage(
    startedAt: string | null,
    queuedAt?: string | null,
    rawStatus?: string
  ): Promise<string> {
    return String((await runningContent({ startedAt, queuedAt, rawStatus })).message);
  }

  async function runningContent(options: {
    startedAt: string | null;
    queuedAt?: string | null;
    rawStatus?: string;
  }): Promise<Record<string, unknown>> {
    const tool = new GetReportRunStatusTool(runningFacade(options), systemTimeService);
    const result = await tool.handler({ report_id: 'report-1', run_id: 'run-1' }, context);
    return result.structuredContent as Record<string, unknown>;
  }

  function minutesAgo(minutes: number): string {
    return new Date(NOW - minutes * 60_000).toISOString();
  }

  it('steers the caller to keep polling while the run is still running', async () => {
    const content = await runningContent({ startedAt: null, queuedAt: null });

    expect(content.should_poll).toBe(true);
    expect(content.stop_reason).toBeNull();
    expect(content.message).toContain('normal');
    expect(content.message).toContain('get_report_run_status');
    expect(content.message).toContain('up to 15 seconds');
    expect(content.message).toContain('stop polling');
    expect(content.message).not.toContain('up to 60 seconds');
    expect(content.message).not.toContain('longer than usual');
  });

  it('warns but keeps polling when a queued run is taking longer than usual', async () => {
    const content = await runningContent({ startedAt: null, queuedAt: minutesAgo(12) });

    expect(content.should_poll).toBe(true);
    expect(content.stop_reason).toBeNull();
    expect(content.message).toContain('about 12 minutes');
    expect(content.message).toContain('may still execute');
    expect(content.message).toContain('keep polling');
    expect(content.message).not.toContain('did not start');
  });

  it('warns at exactly 10 queued minutes', async () => {
    const content = await runningContent({ startedAt: null, queuedAt: minutesAgo(10) });

    expect(content.should_poll).toBe(true);
    expect(content.stop_reason).toBeNull();
    expect(content.message).toContain('about 10 minutes');
    expect(content.message).toContain('keep polling');
  });

  it('stops polling only after a queued run crosses the stuck threshold', async () => {
    const content = await runningContent({ startedAt: null, queuedAt: minutesAgo(45) });

    expect(content.should_poll).toBe(false);
    expect(content.stop_reason).toBe('queued_too_long');
    expect(content.message).toContain('about 45 minutes');
    expect(content.message).toContain('may still execute');
    expect(content.message).toContain('Run History');
    expect(content.message).toContain('before starting another run');
    expect(content.message).not.toContain('did not start');
  });

  it('stops polling at exactly 30 queued minutes', async () => {
    const content = await runningContent({ startedAt: null, queuedAt: minutesAgo(30) });

    expect(content.should_poll).toBe(false);
    expect(content.stop_reason).toBe('queued_too_long');
    expect(content.message).toContain('about 30 minutes');
  });

  it('keeps polling when a worker claimed the run before started_at was recorded', async () => {
    const content = await runningContent({
      startedAt: null,
      queuedAt: minutesAgo(12),
      rawStatus: 'RUNNING',
    });

    expect(content.should_poll).toBe(true);
    expect(content.stop_reason).toBeNull();
    expect(content.message).toContain('claimed by a worker');
    expect(content.message).toContain('keep polling');
    expect(content.message).not.toContain('about 12 minutes');
    expect(content.message).not.toContain('longer than usual');
    expect(content.message).not.toContain('not been picked up');
  });

  it('does not mark a newly claimed run as stuck based on old queue time', async () => {
    const content = await runningContent({
      startedAt: null,
      queuedAt: minutesAgo(45),
      rawStatus: 'RUNNING',
    });

    expect(content.should_poll).toBe(true);
    expect(content.stop_reason).toBeNull();
    expect(content.message).toContain('claimed by a worker');
    expect(content.message).toContain('keep polling');
    expect(content.message).not.toContain('about 45 minutes');
    expect(content.message).not.toContain('Stop polling');
    expect(content.message).not.toContain('not been picked up');
  });

  it('tells the caller to warn the user when the run exceeds the usual duration', async () => {
    const message = await runningMessage(minutesAgo(12));

    expect(message).toContain('about 12 minutes');
    expect(message).toContain('longer than usual');
    expect(message).toContain('keep polling');
  });

  it('warns at exactly 10 started minutes', async () => {
    const message = await runningMessage(minutesAgo(10));

    expect(message).toContain('about 10 minutes');
    expect(message).toContain('longer than usual');
    expect(message).toContain('keep polling');
  });

  it('does not trip the longer-than-usual threshold before the full minute elapses', async () => {
    const message = await runningMessage(minutesAgo(9.5));

    expect(message).toContain('normal');
    expect(message).not.toContain('longer than usual');
  });

  it('tells the caller to stop polling when the run looks stuck', async () => {
    const content = await runningContent({ startedAt: minutesAgo(45), rawStatus: 'RUNNING' });

    expect(content.should_poll).toBe(false);
    expect(content.stop_reason).toBe('running_too_long');
    expect(content.message).toContain('about 45 minutes');
    expect(content.message).toContain('stuck');
    expect(content.message).toContain('Stop polling');
  });

  it('stops polling at exactly 30 started minutes', async () => {
    const content = await runningContent({ startedAt: minutesAgo(30), rawStatus: 'RUNNING' });

    expect(content.should_poll).toBe(false);
    expect(content.stop_reason).toBe('running_too_long');
    expect(content.message).toContain('about 30 minutes');
  });

  it('keeps the message null for terminal runs — status/raw_status/error explain them', async () => {
    const facade = {
      getReportRunStatus: jest.fn().mockResolvedValue({
        reportId: 'report-1',
        runId: 'run-1',
        status: 'cancelled',
        queuedAt: '2026-07-01T09:59:00.000Z',
        startedAt: '2026-07-01T10:00:00.000Z',
        rawStatus: 'CANCELLED',
        error: null,
      }),
    } as unknown as jest.Mocked<McpReportsFacade>;
    const tool = new GetReportRunStatusTool(facade, systemTimeService);

    const result = await tool.handler({ report_id: 'report-1', run_id: 'run-1' }, context);

    expect(result.structuredContent).toMatchObject({
      status: 'cancelled',
      should_poll: false,
      stop_reason: null,
      raw_status: 'CANCELLED',
      error: null,
      message: null,
    });
  });

  it('rejects missing report_id/run_id and unexpected input', () => {
    const tool = new GetReportRunStatusTool({} as McpReportsFacade, systemTimeService);

    expect(() => tool.parseInput({})).toThrow();
    expect(() => tool.parseInput({ report_id: 'report-1' })).toThrow();
    expect(() => tool.parseInput({ run_id: 'run-1' })).toThrow();
    expect(() => tool.parseInput({ report_id: '', run_id: 'run-1' })).toThrow();
    expect(() =>
      tool.parseInput({ report_id: 'report-1', run_id: 'run-1', project_id: 'other' })
    ).toThrow();
  });

  it('is registered with read-only metadata and the right scope', () => {
    const registry = new McpToolRegistry([
      new GetReportRunStatusTool({} as McpReportsFacade, systemTimeService),
    ]);

    expect(new GetReportRunStatusTool({} as McpReportsFacade, systemTimeService)).toMatchObject({
      name: 'get_report_run_status',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        report_id: expect.any(Object),
        run_id: expect.any(Object),
        status: expect.any(Object),
        should_poll: expect.any(Object),
        stop_reason: expect.any(Object),
        queued_at: expect.any(Object),
        started_at: expect.any(Object),
        raw_status: expect.any(Object),
        error: expect.any(Object),
        message: expect.any(Object),
      }),
      annotations: {
        title: 'Get Report Run Status',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(MCP_TOOL_PROVIDER_CLASSES.map(tool => tool.name)).toContain('GetReportRunStatusTool');
    expect(registry.getTool('get_report_run_status')).toBeDefined();
  });

  it('exposes exactly the snapshot fields plus the steering message', () => {
    const tool = new GetReportRunStatusTool({} as McpReportsFacade, systemTimeService);

    expect(Object.keys(tool.outputSchema).sort()).toEqual([
      'error',
      'message',
      'queued_at',
      'raw_status',
      'report_id',
      'run_id',
      'should_poll',
      'started_at',
      'status',
      'stop_reason',
    ]);
  });

  it('spells out the polling protocol in the description', () => {
    const tool = new GetReportRunStatusTool({} as McpReportsFacade, systemTimeService);

    expect(tool.description).toContain('run_report');
    expect(tool.description).toContain('success');
    expect(tool.description).toContain('failed');
    expect(tool.description).toContain('queued_at');
    expect(tool.description).toContain('raw_status');
    expect(tool.description).toContain('should_poll');
    expect(tool.description).toContain('stop_reason');
    expect(tool.description).toContain('started_at');
    expect(tool.description).toContain('15 seconds');
    expect(tool.description).toContain('stop polling');
    expect(tool.description).not.toContain('not a reason to stop polling');
    expect(tool.description).not.toContain('exponential backoff');
    expect(tool.description).not.toContain('up to 60 seconds');
  });
});
