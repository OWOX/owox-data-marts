import { McpConnectorRunFacadeImpl } from './mcp-connector-run.facade.impl';
import { RunType } from '../../common/scheduler/shared/types';

describe('McpConnectorRunFacadeImpl.runConnectorDataMart', () => {
  it('triggers a manual run and returns the run id (PENDING)', async () => {
    const runService = { run: jest.fn().mockResolvedValue('run_1') };
    const getService = { run: jest.fn() };
    const facade = new McpConnectorRunFacadeImpl(runService as never, getService as never);

    await expect(
      facade.runConnectorDataMart({
        projectId: 'p1',
        userId: 'u1',
        roles: ['editor'],
        dataMartId: 'dm_1',
      })
    ).resolves.toEqual({ runId: 'run_1', status: 'PENDING' });

    const cmd = runService.run.mock.calls[0][0];
    expect(cmd).toMatchObject({
      id: 'dm_1',
      projectId: 'p1',
      createdById: 'u1',
      runType: RunType.manual,
      roles: ['editor'],
    });
  });
});

describe('McpConnectorRunFacadeImpl.getConnectorRunStatus', () => {
  it('maps the run dto, capping logs to the last 50 and ISO-stringifying dates', async () => {
    const logs = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const getService = {
      run: jest.fn().mockResolvedValue({
        id: 'run_1',
        dataMartId: 'dm_1',
        status: 'SUCCESS',
        runType: 'manual',
        startedAt: new Date('2026-07-06T10:00:00.000Z'),
        finishedAt: new Date('2026-07-06T10:01:00.000Z'),
        logs,
        errors: ['oops'],
      }),
    };
    const facade = new McpConnectorRunFacadeImpl({ run: jest.fn() } as never, getService as never);

    const res = await facade.getConnectorRunStatus({
      projectId: 'p1',
      userId: 'u1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
      runId: 'run_1',
    });

    expect(res).toEqual({
      runId: 'run_1',
      dataMartId: 'dm_1',
      status: 'SUCCESS',
      runType: 'manual',
      startedAt: '2026-07-06T10:00:00.000Z',
      finishedAt: '2026-07-06T10:01:00.000Z',
      lastLogs: logs.slice(-50),
      errors: ['oops'],
    });
    const cmd = getService.run.mock.calls[0][0];
    expect(cmd).toMatchObject({
      dataMartId: 'dm_1',
      projectId: 'p1',
      runId: 'run_1',
      userId: 'u1',
    });
  });

  it('tolerates null logs/errors/dates', async () => {
    const getService = {
      run: jest.fn().mockResolvedValue({
        id: 'run_2',
        dataMartId: 'dm_1',
        status: 'PENDING',
        runType: 'manual',
        startedAt: null,
        finishedAt: null,
        logs: null,
        errors: null,
      }),
    };
    const facade = new McpConnectorRunFacadeImpl({ run: jest.fn() } as never, getService as never);
    await expect(
      facade.getConnectorRunStatus({
        projectId: 'p1',
        userId: 'u1',
        roles: [],
        dataMartId: 'dm_1',
        runId: 'run_2',
      })
    ).resolves.toMatchObject({ startedAt: null, finishedAt: null, lastLogs: [], errors: [] });
  });
});
