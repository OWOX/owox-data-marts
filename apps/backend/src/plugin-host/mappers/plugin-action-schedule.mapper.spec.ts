import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import type { PluginActionSchedule } from '../entities/plugin-action-schedule.entity';
import type { PluginActionLastRun } from '../services/plugin-action-execution.service';
import {
  toMemberPluginScheduleResponse,
  toPluginScheduleResponse,
  toPluginScheduleView,
  toProjectPluginScheduleResponse,
} from './plugin-action-schedule.mapper';

const NEXT = new Date('2026-10-20T08:00:00.000Z');
const FINISHED = new Date('2026-10-19T08:00:05.000Z');
const CREATED = new Date('2026-10-01T10:00:00.000Z');
const MODIFIED = new Date('2026-10-02T11:30:00.000Z');

const schedule = (overrides: Partial<PluginActionSchedule> = {}): PluginActionSchedule =>
  ({
    id: 'schedule-1',
    pluginId: 'plugin-1',
    installationId: 'installation-1',
    name: 'Nightly',
    action: 'sync',
    parameters: { limit: 5 },
    cronExpression: '0 8 * * *',
    timeZone: 'UTC',
    isActive: true,
    disabledReason: null,
    nextRunTimestamp: NEXT,
    createdAt: CREATED,
    modifiedAt: MODIFIED,
    ...overrides,
  }) as PluginActionSchedule;

const lastRun = (overrides: Partial<PluginActionLastRun> = {}): PluginActionLastRun =>
  ({
    id: 'execution-1',
    status: PluginActionExecutionStatus.FAILED,
    errorCode: 'BOOM',
    finishedAt: FINISHED,
    ...overrides,
  }) as PluginActionLastRun;

describe('plugin-action-schedule.mapper', () => {
  it('maps the entity and its last run to a view', () => {
    expect(toPluginScheduleView(schedule(), lastRun())).toStrictEqual({
      id: 'schedule-1',
      pluginId: 'plugin-1',
      installationId: 'installation-1',
      name: 'Nightly',
      action: 'sync',
      parameters: { limit: 5 },
      cron: '0 8 * * *',
      timeZone: 'UTC',
      enabled: true,
      disabledReason: null,
      nextRunAt: NEXT,
      lastRun: {
        executionId: 'execution-1',
        status: PluginActionExecutionStatus.FAILED,
        errorCode: 'BOOM',
        finishedAt: FINISHED,
      },
      createdAt: CREATED,
      modifiedAt: MODIFIED,
    });
  });

  it('maps a schedule without a last run to lastRun null', () => {
    expect(toPluginScheduleView(schedule(), null).lastRun).toBeNull();
  });

  describe('responses', () => {
    const view = toPluginScheduleView(schedule(), lastRun());

    it('leaves the parameters out of the member response', () => {
      const response = toMemberPluginScheduleResponse(view);

      expect(response).not.toHaveProperty('parameters');
    });

    it('keeps the parameters in the runtime response', () => {
      expect(toPluginScheduleResponse(view)).toMatchObject({
        parameters: { limit: 5 },
        id: 'schedule-1',
      });
    });

    it('turns every date into an ISO string', () => {
      expect(toMemberPluginScheduleResponse(view)).toMatchObject({
        nextRunAt: NEXT.toISOString(),
        lastRun: { finishedAt: FINISHED.toISOString() },
        createdAt: CREATED.toISOString(),
        modifiedAt: MODIFIED.toISOString(),
      });
    });

    it('maps a missing next run and a missing finish time to null', () => {
      const open = toPluginScheduleView(
        schedule({ nextRunTimestamp: null }),
        lastRun({ finishedAt: null })
      );

      expect(toMemberPluginScheduleResponse(open)).toMatchObject({
        nextRunAt: null,
        lastRun: { finishedAt: null },
      });
    });

    it('maps a schedule without a last run to lastRun null', () => {
      expect(toMemberPluginScheduleResponse(toPluginScheduleView(schedule(), null)).lastRun).toBe(
        null
      );
    });

    it('adds the plugin, installation and owner to the project response, without parameters', () => {
      const owner = new UserProjectionDto('alice', 'Alice');

      const response = toProjectPluginScheduleResponse({
        schedule: view,
        pluginName: 'Sheets Sync',
        installationState: 'uninstalled',
        owner,
        canManage: false,
      });

      expect(response).toMatchObject({
        id: 'schedule-1',
        nextRunAt: NEXT.toISOString(),
        pluginId: 'plugin-1',
        pluginName: 'Sheets Sync',
        installationId: 'installation-1',
        installationState: 'uninstalled',
        owner,
        canManage: false,
      });
      expect(response).not.toHaveProperty('parameters');
    });
  });
});
