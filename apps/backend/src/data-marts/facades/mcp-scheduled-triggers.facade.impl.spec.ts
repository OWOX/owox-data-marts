jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
jest.mock('../use-cases/list-project-scheduled-triggers.service', () => ({
  ListProjectScheduledTriggersService: jest.fn(),
}));
jest.mock('../use-cases/create-scheduled-trigger.service', () => ({
  CreateScheduledTriggerService: jest.fn(),
}));
jest.mock('../use-cases/delete-scheduled-trigger.service', () => ({
  DeleteScheduledTriggerService: jest.fn(),
}));
jest.mock('../use-cases/update-scheduled-trigger.service', () => ({
  UpdateScheduledTriggerService: jest.fn(),
}));
jest.mock('../services/report.service', () => ({
  ReportService: jest.fn(),
}));
jest.mock('../services/scheduled-trigger.service', () => ({
  ScheduledTriggerService: jest.fn(),
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ProjectScheduledTriggerDto } from '../dto/domain/project-scheduled-trigger.dto';
import { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ScheduledReportRunConfigType } from '../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import type { ReportService } from '../services/report.service';
import type { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import type { CreateScheduledTriggerService } from '../use-cases/create-scheduled-trigger.service';
import type { DeleteScheduledTriggerService } from '../use-cases/delete-scheduled-trigger.service';
import type { ListProjectScheduledTriggersService } from '../use-cases/list-project-scheduled-triggers.service';
import type { UpdateScheduledTriggerService } from '../use-cases/update-scheduled-trigger.service';
import { McpScheduledTriggersFacadeImpl } from './mcp-scheduled-triggers.facade.impl';

const CTX = { projectId: 'proj-1', userId: 'user-1', roles: ['editor'] };

function makeTriggerDto(): ScheduledTriggerDto {
  return new ScheduledTriggerDto(
    'trigger-1',
    ScheduledTriggerType.REPORT_RUN,
    '0 9 * * 1',
    'UTC',
    true,
    new Date('2026-07-01T09:00:00.000Z'),
    null,
    'user-1',
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-01T00:00:00.000Z'),
    { type: ScheduledReportRunConfigType, reportId: 'report-1' },
    null
  );
}

function makeProjectScheduledTriggerDto(
  type: ScheduledTriggerType = ScheduledTriggerType.REPORT_RUN,
  triggerConfig: ScheduledTriggerDto['triggerConfig'] = {
    type: ScheduledReportRunConfigType,
    reportId: 'report-1',
    report: { id: 'report-1', title: 'Weekly Orders' },
  } as unknown as ScheduledTriggerDto['triggerConfig']
): ProjectScheduledTriggerDto {
  const trigger = new ScheduledTriggerDto(
    'trigger-1',
    type,
    '0 9 * * 1',
    'UTC',
    true,
    new Date('2026-07-01T09:00:00.000Z'),
    null,
    'user-1',
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-01T00:00:00.000Z'),
    triggerConfig,
    null
  );
  return new ProjectScheduledTriggerDto(trigger, { id: 'dm-1', title: 'Orders' }, true, true);
}

function makeEntityTrigger(
  type: ScheduledTriggerType = ScheduledTriggerType.REPORT_RUN
): DataMartScheduledTrigger {
  return {
    id: 'trigger-1',
    type,
    cronExpression: '0 9 * * 1',
    timeZone: 'UTC',
    isActive: true,
    triggerConfig:
      type === ScheduledTriggerType.REPORT_RUN
        ? { type: ScheduledReportRunConfigType, reportId: 'report-1' }
        : undefined,
    dataMart: { id: 'dm-1', projectId: 'proj-1' },
  } as unknown as DataMartScheduledTrigger;
}

function buildFacade(
  overrides: {
    listProjectScheduledTriggersService?: Partial<jest.Mocked<ListProjectScheduledTriggersService>>;
    createScheduledTriggerService?: Partial<jest.Mocked<CreateScheduledTriggerService>>;
    deleteScheduledTriggerService?: Partial<jest.Mocked<DeleteScheduledTriggerService>>;
    updateScheduledTriggerService?: Partial<jest.Mocked<UpdateScheduledTriggerService>>;
    reportService?: Partial<jest.Mocked<ReportService>>;
    scheduledTriggerService?: Partial<jest.Mocked<ScheduledTriggerService>>;
  } = {}
): McpScheduledTriggersFacadeImpl {
  return new McpScheduledTriggersFacadeImpl(
    {
      run: jest.fn().mockResolvedValue([]),
      ...overrides.listProjectScheduledTriggersService,
    } as unknown as jest.Mocked<ListProjectScheduledTriggersService>,
    {
      run: jest.fn().mockResolvedValue(makeTriggerDto()),
      ...overrides.createScheduledTriggerService,
    } as unknown as jest.Mocked<CreateScheduledTriggerService>,
    {
      run: jest.fn().mockResolvedValue(undefined),
      ...overrides.deleteScheduledTriggerService,
    } as unknown as jest.Mocked<DeleteScheduledTriggerService>,
    {
      run: jest.fn().mockResolvedValue(makeTriggerDto()),
      ...overrides.updateScheduledTriggerService,
    } as unknown as jest.Mocked<UpdateScheduledTriggerService>,
    {
      getByIdAndProjectId: jest.fn(),
      ...overrides.reportService,
    } as unknown as jest.Mocked<ReportService>,
    {
      getByIdAndProjectId: jest.fn(),
      getAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue([]),
      ...overrides.scheduledTriggerService,
    } as unknown as jest.Mocked<ScheduledTriggerService>
  );
}

function ownedTrigger(
  id: string,
  createdById = 'user-1',
  reportId = 'report-1'
): DataMartScheduledTrigger {
  return {
    id,
    type: ScheduledTriggerType.REPORT_RUN,
    createdById,
    triggerConfig: { type: ScheduledReportRunConfigType, reportId },
    dataMart: { id: 'dm-1', projectId: 'proj-1' },
  } as unknown as DataMartScheduledTrigger;
}

describe('McpScheduledTriggersFacadeImpl', () => {
  describe('listReportRunSchedules', () => {
    it('maps report run schedules to schedule items', async () => {
      const reportRunDto = makeProjectScheduledTriggerDto(ScheduledTriggerType.REPORT_RUN);

      const facade = buildFacade({
        listProjectScheduledTriggersService: {
          run: jest.fn().mockResolvedValue([reportRunDto]),
        },
      });

      const result = await facade.listReportRunSchedules(CTX);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        triggerId: 'trigger-1',
        report: { id: 'report-1', title: 'Weekly Orders' },
        dataMart: { id: 'dm-1', title: 'Orders' },
        cronExpression: '0 9 * * 1',
        timeZone: 'UTC',
        isActive: true,
        nextRunAt: '2026-07-01T09:00:00.000Z',
        lastRunAt: null,
        canEdit: true,
        canDelete: true,
      });
    });

    it('passes correct command to list service', async () => {
      const listRun = jest.fn().mockResolvedValue([]);
      const facade = buildFacade({
        listProjectScheduledTriggersService: { run: listRun },
      });

      await facade.listReportRunSchedules(CTX);

      expect(listRun).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          userId: 'user-1',
          roles: ['editor'],
          limit: 500,
          offset: 0,
          type: ScheduledTriggerType.REPORT_RUN,
        })
      );
    });

    it('walks every page until a short page ends the list', async () => {
      const PAGE_SIZE = 500;
      const reportRunDto = makeProjectScheduledTriggerDto();
      const listRun = jest
        .fn()
        .mockResolvedValueOnce(Array.from({ length: PAGE_SIZE }, () => reportRunDto))
        .mockResolvedValueOnce([reportRunDto]);
      const facade = buildFacade({
        listProjectScheduledTriggersService: { run: listRun },
      });

      const result = await facade.listReportRunSchedules(CTX);

      expect(listRun).toHaveBeenCalledTimes(2);
      expect(listRun).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ limit: PAGE_SIZE, offset: 0 })
      );
      expect(listRun).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ limit: PAGE_SIZE, offset: PAGE_SIZE })
      );
      expect(result).toHaveLength(PAGE_SIZE + 1);
    });
  });

  describe('createReportRunSchedule', () => {
    it('rejects an invalid cron expression before any lookup or write', async () => {
      const getReport = jest.fn();
      const createRun = jest.fn();
      const facade = buildFacade({
        reportService: { getByIdAndProjectId: getReport },
        createScheduledTriggerService: { run: createRun },
      });

      await expect(
        facade.createReportRunSchedule(CTX, {
          reportId: 'report-1',
          cronExpression: 'not-a-cron',
          timeZone: 'UTC',
          isActive: true,
        })
      ).rejects.toThrow(BusinessViolationException);

      expect(getReport).not.toHaveBeenCalled();
      expect(createRun).not.toHaveBeenCalled();
    });

    it('rejects an invalid timezone', async () => {
      const createRun = jest.fn();
      const facade = buildFacade({
        createScheduledTriggerService: { run: createRun },
      });

      await expect(
        facade.createReportRunSchedule(CTX, {
          reportId: 'report-1',
          cronExpression: '0 9 * * 1',
          timeZone: 'Mars/Phobos',
          isActive: true,
        })
      ).rejects.toThrow(BusinessViolationException);

      expect(createRun).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when report belongs to a different project', async () => {
      const facade = buildFacade({
        reportService: {
          getByIdAndProjectId: jest
            .fn()
            .mockRejectedValue(new NotFoundException('Report with id report-1 not found')),
        },
      });

      await expect(
        facade.createReportRunSchedule(CTX, {
          reportId: 'report-1',
          cronExpression: '0 9 * * 1',
          timeZone: 'UTC',
          isActive: true,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a new schedule and returns mapped result', async () => {
      const createRun = jest.fn().mockResolvedValue(makeTriggerDto());
      const deleteRun = jest.fn().mockResolvedValue(undefined);
      const getExisting = jest.fn();
      const facade = buildFacade({
        reportService: {
          getByIdAndProjectId: jest.fn().mockResolvedValue({ dataMart: { id: 'dm-1' } }),
        },
        scheduledTriggerService: { getAllByDataMartIdAndProjectId: getExisting },
        createScheduledTriggerService: { run: createRun },
        deleteScheduledTriggerService: { run: deleteRun },
      });

      const result = await facade.createReportRunSchedule(CTX, {
        reportId: 'report-1',
        cronExpression: '0 9 * * 1',
        timeZone: 'UTC',
        isActive: true,
      });

      expect(createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          userId: 'user-1',
          dataMartId: 'dm-1',
          type: ScheduledTriggerType.REPORT_RUN,
          cronExpression: '0 9 * * 1',
          timeZone: 'UTC',
          isActive: true,
          triggerConfig: { type: ScheduledReportRunConfigType, reportId: 'report-1' },
          roles: ['editor'],
        })
      );
      expect(deleteRun).not.toHaveBeenCalled();
      expect(getExisting).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        triggerId: 'trigger-1',
        reportId: 'report-1',
        cronExpression: '0 9 * * 1',
        timeZone: 'UTC',
        isActive: true,
        nextRunAt: '2026-07-01T09:00:00.000Z',
      });
    });

    it("does not replace the current user's existing schedules for the report", async () => {
      const createRun = jest.fn().mockResolvedValue(makeTriggerDto());
      const deleteRun = jest.fn().mockResolvedValue(undefined);
      const facade = buildFacade({
        reportService: {
          getByIdAndProjectId: jest.fn().mockResolvedValue({ dataMart: { id: 'dm-1' } }),
        },
        scheduledTriggerService: {
          getAllByDataMartIdAndProjectId: jest
            .fn()
            .mockResolvedValue([ownedTrigger('old-trigger')]),
        },
        createScheduledTriggerService: { run: createRun },
        deleteScheduledTriggerService: { run: deleteRun },
      });

      await facade.createReportRunSchedule(CTX, {
        reportId: 'report-1',
        cronExpression: '0 9 * * 1',
        timeZone: 'UTC',
        isActive: true,
      });

      expect(createRun).toHaveBeenCalled();
      expect(deleteRun).not.toHaveBeenCalled();
    });

    it('does not inspect other users, other reports, or other trigger types before creating', async () => {
      const deleteRun = jest.fn().mockResolvedValue(undefined);
      const getExisting = jest.fn().mockResolvedValue([
        ownedTrigger('mine', 'user-1', 'report-1'),
        ownedTrigger('other-user', 'user-2', 'report-1'),
        ownedTrigger('other-report', 'user-1', 'report-2'),
        {
          id: 'connector',
          type: ScheduledTriggerType.CONNECTOR_RUN,
          createdById: 'user-1',
          triggerConfig: undefined,
        } as unknown as DataMartScheduledTrigger,
      ]);
      const facade = buildFacade({
        reportService: {
          getByIdAndProjectId: jest.fn().mockResolvedValue({ dataMart: { id: 'dm-1' } }),
        },
        scheduledTriggerService: {
          getAllByDataMartIdAndProjectId: getExisting,
        },
        deleteScheduledTriggerService: { run: deleteRun },
      });

      await facade.createReportRunSchedule(CTX, {
        reportId: 'report-1',
        cronExpression: '0 9 * * 1',
        timeZone: 'UTC',
        isActive: true,
      });

      expect(getExisting).not.toHaveBeenCalled();
      expect(deleteRun).not.toHaveBeenCalled();
    });
  });

  describe('updateReportRunSchedule', () => {
    it('rejects an invalid cron expression before loading the trigger', async () => {
      const getTrigger = jest.fn();
      const updateRun = jest.fn();
      const facade = buildFacade({
        scheduledTriggerService: { getByIdAndProjectId: getTrigger },
        updateScheduledTriggerService: { run: updateRun },
      });

      await expect(
        facade.updateReportRunSchedule(CTX, {
          triggerId: 'trigger-1',
          cronExpression: 'not-a-cron',
          timeZone: 'UTC',
          isActive: true,
        })
      ).rejects.toThrow(BusinessViolationException);

      expect(getTrigger).not.toHaveBeenCalled();
      expect(updateRun).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when trigger is not a REPORT_RUN', async () => {
      const updateRun = jest.fn();
      const facade = buildFacade({
        scheduledTriggerService: {
          getByIdAndProjectId: jest
            .fn()
            .mockResolvedValue(makeEntityTrigger(ScheduledTriggerType.CONNECTOR_RUN)),
        },
        updateScheduledTriggerService: { run: updateRun },
      });

      await expect(
        facade.updateReportRunSchedule(CTX, {
          triggerId: 'trigger-1',
          cronExpression: '0 9 * * 1',
          timeZone: 'UTC',
          isActive: true,
        })
      ).rejects.toThrow(BadRequestException);

      expect(updateRun).not.toHaveBeenCalled();
    });

    it('updates the schedule identified by trigger_id without looking up schedules by report', async () => {
      const getExisting = jest.fn();
      const updateRun = jest.fn().mockResolvedValue(makeTriggerDto());
      const facade = buildFacade({
        scheduledTriggerService: {
          getByIdAndProjectId: jest.fn().mockResolvedValue(makeEntityTrigger()),
          getAllByDataMartIdAndProjectId: getExisting,
        },
        updateScheduledTriggerService: { run: updateRun },
      });

      const result = await facade.updateReportRunSchedule(CTX, {
        triggerId: 'trigger-1',
        cronExpression: '0 10 * * 1',
        timeZone: 'Europe/Kyiv',
        isActive: false,
      });

      expect(updateRun).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trigger-1',
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          userId: 'user-1',
          roles: ['editor'],
          cronExpression: '0 10 * * 1',
          timeZone: 'Europe/Kyiv',
          isActive: false,
        })
      );
      expect(getExisting).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        triggerId: 'trigger-1',
        reportId: 'report-1',
      });
    });
  });

  describe('deleteReportRunSchedule', () => {
    it('throws BadRequestException when trigger is not a REPORT_RUN', async () => {
      const facade = buildFacade({
        scheduledTriggerService: {
          getByIdAndProjectId: jest
            .fn()
            .mockResolvedValue(makeEntityTrigger(ScheduledTriggerType.CONNECTOR_RUN)),
        },
      });

      await expect(facade.deleteReportRunSchedule(CTX, { triggerId: 'trigger-1' })).rejects.toThrow(
        BadRequestException
      );
    });

    it('calls delete service and returns triggerId and reportId', async () => {
      const deleteRun = jest.fn().mockResolvedValue(undefined);
      const facade = buildFacade({
        scheduledTriggerService: {
          getByIdAndProjectId: jest.fn().mockResolvedValue(makeEntityTrigger()),
        },
        deleteScheduledTriggerService: { run: deleteRun },
      });

      const result = await facade.deleteReportRunSchedule(CTX, { triggerId: 'trigger-1' });

      expect(deleteRun).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trigger-1',
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          userId: 'user-1',
          roles: ['editor'],
        })
      );

      expect(result).toEqual({ triggerId: 'trigger-1', reportId: 'report-1' });
    });
  });
});
