jest.mock('../use-cases/run-data-mart.service', () => ({ RunDataMartService: jest.fn() }));
jest.mock('../use-cases/get-data-mart-run.service', () => ({ GetDataMartRunService: jest.fn() }));
jest.mock('../use-cases/list-data-mart-runs.service', () => ({
  ListDataMartRunsService: jest.fn(),
}));
jest.mock('../use-cases/cancel-data-mart-run.service', () => ({
  CancelDataMartRunService: jest.fn(),
}));
jest.mock('../use-cases/list-scheduled-triggers.service', () => ({
  ListScheduledTriggersService: jest.fn(),
}));
jest.mock('../use-cases/create-scheduled-trigger.service', () => ({
  CreateScheduledTriggerService: jest.fn(),
}));
jest.mock('../use-cases/update-scheduled-trigger.service', () => ({
  UpdateScheduledTriggerService: jest.fn(),
}));
jest.mock('../use-cases/delete-scheduled-trigger.service', () => ({
  DeleteScheduledTriggerService: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { McpDataMartExecutionFacadeImpl } from './mcp-data-mart-execution.facade.impl';
import { McpDataMartExecutionMapper } from '../mappers/mcp-data-mart-execution.mapper';

const ctx = { projectId: 'project', userId: 'user', roles: ['editor'] };
const schedule = {
  id: 'schedule',
  type: 'CONNECTOR_RUN',
  cronExpression: '0 9 * * *',
  timeZone: 'UTC',
  isActive: true,
  nextRunTimestamp: null,
  lastRunTimestamp: null,
};
const run = {
  id: 'run',
  dataMartId: 'dm',
  type: 'CONNECTOR',
  runType: 'manual',
  status: 'PENDING',
  createdAt: new Date('2026-01-01'),
  startedAt: null,
  finishedAt: null,
  logs: ['secret'],
  errors: ['secret'],
  definitionRun: { credentials: 'secret' },
  additionalParams: { token: 'secret' },
};
function setup() {
  const deps = {
    run: { run: jest.fn().mockResolvedValue('run') },
    get: { run: jest.fn().mockResolvedValue(run) },
    list: { run: jest.fn().mockResolvedValue([run]) },
    cancel: { run: jest.fn().mockResolvedValue(undefined) },
    schedules: {
      run: jest.fn().mockResolvedValue([schedule, { ...schedule, type: 'REPORT_RUN' }]),
    },
    create: { run: jest.fn().mockResolvedValue(schedule) },
    update: { run: jest.fn().mockResolvedValue(schedule) },
    delete: { run: jest.fn().mockResolvedValue(undefined) },
  };
  const facade = new McpDataMartExecutionFacadeImpl(
    deps.run as never,
    deps.get as never,
    deps.list as never,
    deps.cancel as never,
    deps.schedules as never,
    deps.create as never,
    deps.update as never,
    deps.delete as never,
    new McpDataMartExecutionMapper()
  );
  return { facade, ...deps };
}
describe('McpDataMartExecutionFacadeImpl', () => {
  it('queues with server actor and HTTP manual-run semantics', async () => {
    const { facade, run } = setup();
    expect(
      await facade.run(ctx, { dataMartId: 'dm', payload: { runType: 'INCREMENTAL' } })
    ).toEqual({ dataMartId: 'dm', runId: 'run', status: 'queued' });
    expect(run.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dm',
        projectId: 'project',
        createdById: 'user',
        roles: ['editor'],
        runType: 'manual',
        payload: { runType: 'INCREMENTAL' },
      })
    );
  });
  it('maps runs without secrets or provider diagnostics', async () => {
    const { facade, get } = setup();
    const result = await facade.getRun(ctx, { dataMartId: 'dm', runId: 'run' });
    expect(result).toEqual({
      runId: 'run',
      dataMartId: 'dm',
      status: 'PENDING',
      type: 'CONNECTOR',
      runType: 'manual',
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      errorSummary: 'Open Run History in OWOX to inspect the run errors.',
      shouldPoll: true,
    });
    expect(get.run).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'dm',
        runId: 'run',
        userId: 'user',
        projectId: 'project',
        roles: ['editor'],
      })
    );
  });
  it('passes pagination and maps each listed run', async () => {
    const { facade, list } = setup();
    const result = await facade.listRuns(ctx, { dataMartId: 'dm', limit: 10, offset: 20 });
    expect(result).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(list.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dm',
        limit: 10,
        offset: 20,
        userId: 'user',
        roles: ['editor'],
      })
    );
  });
  it('applies HTTP cancellation without claiming a chain segment status', async () => {
    const { facade, cancel } = setup();
    expect(await facade.cancelRun(ctx, { dataMartId: 'dm', runId: 'run' })).toEqual({
      dataMartId: 'dm',
      runId: 'run',
      cancellationApplied: true,
    });
    expect(cancel.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dm',
        runId: 'run',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
      })
    );
  });
  it('passes actor admission to the shared list use case and exposes only connector schedules', async () => {
    const { facade, schedules } = setup();
    expect(await facade.listSchedules(ctx, { dataMartId: 'dm' })).toHaveLength(1);
    expect(schedules.run).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'dm',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
      })
    );
  });
  it('creates only connector schedules with no report config', async () => {
    const { facade, create } = setup();
    await facade.createSchedule(ctx, {
      dataMartId: 'dm',
      cronExpression: '0 9 * * *',
      timeZone: 'UTC',
      isActive: false,
    });
    expect(create.run).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONNECTOR_RUN',
        userId: 'user',
        roles: ['editor'],
        triggerConfig: undefined,
        isActive: false,
      })
    );
  });
  it('lets the shared update use case resolve omitted saved values and constrain trigger type', async () => {
    const { facade, update } = setup();
    await facade.updateSchedule(ctx, {
      dataMartId: 'dm',
      triggerId: 'schedule',
      cronExpression: '0 8 * * *',
      isActive: false,
    });
    expect(update.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'schedule',
        dataMartId: 'dm',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        cronExpression: '0 8 * * *',
        timeZone: undefined,
        isActive: false,
        expectedType: 'CONNECTOR_RUN',
      })
    );
  });
  it('deletes through the existing use case with the scoped connector type', async () => {
    const { facade, delete: remove } = setup();
    expect(await facade.deleteSchedule(ctx, { dataMartId: 'dm', triggerId: 'schedule' })).toEqual({
      dataMartId: 'dm',
      triggerId: 'schedule',
    });
    expect(remove.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'schedule',
        dataMartId: 'dm',
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        expectedType: 'CONNECTOR_RUN',
      })
    );
  });
  it('retains access denial from the shared schedule use cases', async () => {
    const { facade, schedules, delete: remove } = setup();
    schedules.run.mockRejectedValue(new ForbiddenException());
    remove.run.mockRejectedValue(new ForbiddenException());
    await expect(facade.listSchedules(ctx, { dataMartId: 'dm' })).rejects.toThrow(
      ForbiddenException
    );
    await expect(
      facade.deleteSchedule(ctx, { dataMartId: 'dm', triggerId: 'schedule' })
    ).rejects.toThrow(ForbiddenException);
  });
  it('propagates use-case failures without returning a queued result', async () => {
    const { facade, run } = setup();
    run.run.mockRejectedValue(new Error('provider secret'));
    await expect(facade.run(ctx, { dataMartId: 'dm' })).rejects.toThrow('provider secret');
  });
  it.each(['SUCCESS', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RESTRICTED'])(
    'stops polling non-active %s runs',
    async status => {
      const { facade, get } = setup();
      get.run.mockResolvedValue({ ...run, status });
      expect((await facade.getRun(ctx, { dataMartId: 'dm', runId: 'run' })).shouldPoll).toBe(false);
    }
  );
});
