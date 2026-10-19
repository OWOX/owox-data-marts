jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataMartExecutionService } from './data-mart-execution.service';
import { McpDataMartExecutionMapper } from '../mappers/mcp-data-mart-execution.mapper';
import { CancelDataMartRunService } from './cancel-data-mart-run.service';
import { Action, EntityType } from '../services/access-decision';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
const request = { ...actor, dataMartId: 'dm', runId: 'run' };
const date = new Date('2026-10-19T00:00:00Z');
const chain = {
  id: 'chain',
  requestedStart: '2026-01-01',
  requestedEnd: '2026-06-01',
  segmentIndex: 1,
  segmentsTotal: 5,
  segmentDays: 31,
};
function fixture() {
  const run = {
    id: 'run',
    dataMartId: 'dm',
    type: DataMartRunType.CONNECTOR,
    status: DataMartRunStatus.RUNNING,
    runType: 'manual',
    createdAt: date,
    additionalParams: {
      payload: {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-01-01', EndDate: '2026-01-31', accessToken: 'SECRET' },
      },
      backfill: chain,
      httpData: { token: 'SECRET' },
    },
    logs: ['SECRET'],
    errors: ['SECRET'],
    definitionRun: { token: 'SECRET' },
  };
  const marts = {
    getByIdAndProjectId: jest
      .fn()
      .mockResolvedValue({ id: 'dm', projectId: 'project', revision: 1 }),
  };
  const runs = {
    getByIdAndDataMartId: jest.fn().mockResolvedValue(run),
    findActiveConnectorRun: jest.fn().mockResolvedValue(null),
    markAsCancelled: jest.fn(async target => {
      target.status = DataMartRunStatus.CANCELLED;
      return true;
    }),
  };
  const access = {
    canAccessStored: jest.fn().mockResolvedValue(true),
    canAccess: jest.fn().mockResolvedValue(true),
  };
  const schedules = { getAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue([]) };
  const triggers = { stopTriggersForRun: jest.fn().mockResolvedValue(undefined) };
  const cancel = new CancelDataMartRunService(
    marts as any,
    runs as any,
    triggers as any,
    {} as any,
    {} as any,
    {} as any,
    access as any
  );
  const service = new DataMartExecutionService(
    marts as any,
    runs as any,
    schedules as any,
    access as any,
    cancel,
    new McpDataMartExecutionMapper(),
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { service, marts, runs, access, schedules, triggers, run };
}

describe('DataMartExecutionService', () => {
  it('returns only stored status, safe load dates and chain metadata, never diagnostics/configuration', async () => {
    const { service, access } = fixture();
    const result = await service.getRun(request);
    expect(result).toEqual({
      id: 'run',
      dataMartId: 'dm',
      type: 'CONNECTOR',
      status: 'RUNNING',
      runType: 'manual',
      configurationRevision: null,
      currentConfigurationRevision: 1,
      configurationCurrent: null,
      createdAt: date.toISOString(),
      startedAt: null,
      finishedAt: null,
      diagnostics: { logsAvailable: true, errorsAvailable: true, content: 'withheld' },
      load: {
        runType: 'MANUAL_BACKFILL',
        dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
      },
      backfillChain: chain,
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(access.canAccessStored).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'dm',
      Action.SEE,
      'project'
    );
    expect(access.canAccess).not.toHaveBeenCalled();
  });
  it.each([{ userId: '' }, { projectId: '' }, { roles: [] }, { roles: ['viewer'] }])(
    'requires a complete domain actor %p',
    async invalid => {
      const { service, marts } = fixture();
      await expect(service.getRun({ ...request, ...invalid })).rejects.toThrow();
      expect(marts.getByIdAndProjectId).not.toHaveBeenCalled();
    }
  );
  it('scopes project and Data Mart and run before action authorization, including admins', async () => {
    const { service, marts, runs, access } = fixture();
    marts.getByIdAndProjectId.mockRejectedValueOnce(new NotFoundException());
    await expect(service.getRun(request)).rejects.toThrow(NotFoundException);
    expect(runs.getByIdAndDataMartId).not.toHaveBeenCalled();
    runs.getByIdAndDataMartId.mockResolvedValueOnce(null);
    await expect(service.getRun({ ...request, roles: ['admin'] })).rejects.toThrow(
      NotFoundException
    );
    expect(runs.getByIdAndDataMartId).toHaveBeenCalledWith('run', 'dm');
    expect(access.canAccessStored).not.toHaveBeenCalled();
    runs.getByIdAndDataMartId.mockResolvedValueOnce({ ...fixture().run, dataMartId: 'other' });
    await expect(service.getRun(request)).rejects.toThrow(NotFoundException);
  });
  it('rejects revoked SEE rights and propagates storage failures', async () => {
    const { service, access, runs } = fixture();
    access.canAccessStored.mockResolvedValue(false);
    await expect(service.getRun(request)).rejects.toThrow(ForbiddenException);
    runs.getByIdAndDataMartId.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getRun(request)).rejects.toThrow('database unavailable');
  });
  it('lists only connector load schedules with default parameters and recurring cost implications', async () => {
    const { service, schedules, access } = fixture();
    schedules.getAllByDataMartIdAndProjectId.mockResolvedValue([
      {
        id: 'load',
        type: ScheduledTriggerType.CONNECTOR_RUN,
        cronExpression: '0 0 * * *',
        timeZone: 'UTC',
        isActive: true,
        nextRunTimestamp: date,
        triggerConfig: { token: 'SECRET' },
      },
      {
        id: 'report',
        type: ScheduledTriggerType.REPORT_RUN,
        triggerConfig: { reportId: 'SECRET' },
      },
      { id: 'dq', type: ScheduledTriggerType.DATA_QUALITY_RUN },
    ] as any);
    expect(await service.listSchedules(request)).toEqual({
      dataMartId: 'dm',
      revision: 1,
      revisionAggregate: 'data-mart-configuration',
      schedules: [
        {
          id: 'load',
          cronExpression: '0 0 * * *',
          timeZone: 'UTC',
          enabled: true,
          nextRunAt: date.toISOString(),
          revision: 1,
          loadParameters: { mode: 'connector-default', configurable: false },
          recurringEffect:
            'Each enabled occurrence starts a connector load and may consume billable resources.',
        },
      ],
    });
    expect(access.canAccessStored).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'dm',
      Action.MANAGE_TRIGGERS,
      'project'
    );
    expect(access.canAccess).not.toHaveBeenCalled();
  });
  it('does not enumerate schedules without MANAGE_TRIGGERS', async () => {
    const { service, schedules, access } = fixture();
    access.canAccessStored.mockResolvedValue(false);
    await expect(service.listSchedules(request)).rejects.toThrow(ForbiddenException);
    expect(schedules.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });
  it('uses real cancellation to stop the active successor of a completed backfill segment', async () => {
    const { service, run, runs, triggers, access } = fixture();
    run.status = DataMartRunStatus.SUCCESS;
    const active = { ...run, id: 'successor', status: DataMartRunStatus.RUNNING };
    runs.findActiveConnectorRun.mockResolvedValue(active as any);
    expect(await service.cancelRun(request)).toEqual({
      dataMartId: 'dm',
      requestedRunId: 'run',
      scope: 'backfill-chain',
      outcome: 'cancelled',
      rollback: false,
    });
    expect(runs.markAsCancelled).toHaveBeenCalledWith(active);
    expect(triggers.stopTriggersForRun).toHaveBeenCalledWith('successor');
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DATA_MART,
      'dm',
      Action.EDIT,
      'project'
    );
  });
  it('returns persisted already-cancelled state on repeat and rechecks current rights', async () => {
    const { service, run, runs, triggers, access } = fixture();
    run.additionalParams = {} as any;
    await service.cancelRun(request);
    expect((await service.cancelRun(request)).outcome).toBe('already-cancelled');
    expect(runs.markAsCancelled).toHaveBeenCalledTimes(1);
    expect(triggers.stopTriggersForRun).toHaveBeenCalledTimes(1);
    access.canAccessStored.mockResolvedValue(false);
    await expect(service.cancelRun(request)).rejects.toThrow(ForbiddenException);
  });
  it('keeps a terminal conflict when repeating cancellation through a completed chain anchor', async () => {
    const { service, run, runs, triggers } = fixture();
    run.status = DataMartRunStatus.SUCCESS;
    const successor = { ...run, id: 'successor', status: DataMartRunStatus.RUNNING };
    runs.findActiveConnectorRun.mockImplementation(async () =>
      successor.status === DataMartRunStatus.RUNNING ? successor : null
    );
    await service.cancelRun(request);
    await expect(service.cancelRun(request)).rejects.toThrow(ConflictException);
    expect(run.status).toBe(DataMartRunStatus.SUCCESS);
    expect(successor.status).toBe(DataMartRunStatus.CANCELLED);
    expect(runs.markAsCancelled).toHaveBeenCalledTimes(1);
    expect(triggers.stopTriggersForRun).toHaveBeenCalledTimes(1);
  });
  it('rejects a foreign Data Mart run ID before cancellation or action checks', async () => {
    const { service, runs, access, triggers } = fixture();
    runs.getByIdAndDataMartId.mockResolvedValue(null);
    await expect(service.cancelRun(request)).rejects.toThrow(NotFoundException);
    expect(access.canAccessStored).not.toHaveBeenCalled();
    expect(access.canAccess).not.toHaveBeenCalled();
    expect(triggers.stopTriggersForRun).not.toHaveBeenCalled();
  });
  it.each([DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED, DataMartRunStatus.INTERRUPTED])(
    'does not repeat a terminal %s run',
    async status => {
      const { service, run, runs, triggers } = fixture();
      run.additionalParams = {} as any;
      run.status = status;
      await expect(service.cancelRun(request)).rejects.toThrow(ConflictException);
      expect(runs.markAsCancelled).not.toHaveBeenCalled();
      expect(triggers.stopTriggersForRun).not.toHaveBeenCalled();
    }
  );
  it('never cancels an unrelated active chain or a Report run', async () => {
    const { service, run, runs, triggers } = fixture();
    run.status = DataMartRunStatus.SUCCESS;
    runs.findActiveConnectorRun.mockResolvedValue({
      ...run,
      id: 'unrelated',
      status: DataMartRunStatus.RUNNING,
      additionalParams: { backfill: { ...chain, id: 'other-chain' } },
    } as any);
    await expect(service.cancelRun(request)).rejects.toThrow(ConflictException);
    run.type = DataMartRunType.EMAIL;
    await expect(service.cancelRun(request)).rejects.toThrow('Only connector');
    expect(runs.markAsCancelled).not.toHaveBeenCalled();
    expect(triggers.stopTriggersForRun).not.toHaveBeenCalled();
  });
  it('refuses unknown states and incomplete actors before cancellation', async () => {
    const { service, run, runs } = fixture();
    run.status = 'UNKNOWN' as any;
    await expect(service.cancelRun(request)).rejects.toThrow(ConflictException);
    await expect(service.cancelRun({ ...request, userId: '' })).rejects.toThrow(
      UnauthorizedException
    );
    expect(runs.markAsCancelled).not.toHaveBeenCalled();
  });
});
