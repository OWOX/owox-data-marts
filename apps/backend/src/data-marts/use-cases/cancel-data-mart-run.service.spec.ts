jest.mock('typeorm-transactional', () => ({
  Transactional: jest.fn(
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor
  ),
}));

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService } from '../services/access-decision';
import { CancelDataMartRunService } from './cancel-data-mart-run.service';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import { ReportService } from '../services/report.service';
import { DataQualityRunService } from '../services/data-quality-run.service';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartRun } from '../entities/data-mart-run.entity';

describe('CancelDataMartRunService', () => {
  const createService = () => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'dm-1',
        projectId: 'project-1',
      }),
    } as unknown as DataMartService;

    const dataMartRunService = {
      getByIdAndDataMartId: jest.fn(),
      markAsCancelled: jest.fn().mockImplementation(async run => {
        run.status = DataMartRunStatus.CANCELLED;
        run.finishedAt = new Date('2026-07-15T10:00:00.000Z');
        return true;
      }),
    } as unknown as DataMartRunService;

    const connectorRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorRunTriggerService;

    const reportRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportRunTriggerService;

    const dataQualityRunService = {
      markAsCancelled: jest.fn().mockResolvedValue(undefined),
      cancelActiveRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as DataQualityRunService;

    const reportService = {
      markRunAsCancelled: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportService;

    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    } as unknown as AccessDecisionService;

    const service = new CancelDataMartRunService(
      dataMartService,
      dataMartRunService,
      connectorRunTriggerService,
      reportRunTriggerService,
      dataQualityRunService,
      reportService,
      accessDecisionService
    );

    return {
      service,
      dataMartService,
      dataMartRunService,
      connectorRunTriggerService,
      reportRunTriggerService,
      dataQualityRunService,
      reportService,
      accessDecisionService,
    };
  };

  const command = {
    id: 'dm-1',
    runId: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    roles: [],
  };

  it('cancels a connector run and stops its trigger', async () => {
    const { service, dataMartRunService, connectorRunTriggerService } = createService();
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.RUNNING,
    };
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(run);

    await service.run(command);

    expect(dataMartRunService.markAsCancelled).toHaveBeenCalledWith(run);
    expect(connectorRunTriggerService.stopTriggersForRun).toHaveBeenCalledWith('run-1');
  });

  it('cancels a standard report run and updates the report status', async () => {
    const { service, dataMartRunService, reportRunTriggerService, reportService } = createService();
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      reportId: 'report-1',
      type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
      status: DataMartRunStatus.PENDING,
    };
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(run);

    await service.run(command);

    expect(dataMartRunService.markAsCancelled).toHaveBeenCalledWith(run);
    expect(reportRunTriggerService.stopTriggersForRun).toHaveBeenCalledWith('run-1');
    expect(reportService.markRunAsCancelled).toHaveBeenCalledWith('report-1');
  });

  it('delegates a pending Data Quality run to the run-first transactional cancellation path', async () => {
    const { service, dataMartRunService, dataQualityRunService } = createService();
    const partialResults = [{ ruleKey: 'already-finished' }];
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.PENDING,
      finishedAt: null,
      dataQualitySummary: {
        state: DataQualitySummaryState.QUEUED,
        enabledChecks: 1,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 0,
        errorFindings: 0,
        violationCount: 0,
        highestSeverity: null,
      },
      dataQualityResults: partialResults,
    };
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(run);

    await service.run(command);

    expect(dataQualityRunService.cancelActiveRun).toHaveBeenCalledWith('run-1', 'dm-1');
    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(run.dataQualityResults).toBe(partialResults);
  });

  it('leaves a running Data Quality run and trigger retryable when consumption settlement fails', async () => {
    const { service, dataMartRunService, dataQualityRunService } = createService();
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.DATA_QUALITY,
      status: DataMartRunStatus.RUNNING,
      startedAt: new Date('2026-07-15T09:59:00.000Z'),
      finishedAt: null,
    } as DataMartRun;
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(run);
    (dataQualityRunService.cancelActiveRun as jest.Mock).mockRejectedValue(
      new Error('pubsub unavailable')
    );

    await expect(service.run(command)).rejects.toThrow('pubsub unavailable');

    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
    expect(run).toMatchObject({ status: DataMartRunStatus.RUNNING, finishedAt: null });
  });

  it('rejects unsupported run types', async () => {
    const { service, dataMartRunService } = createService();
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue({
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.HTTP_DATA,
      status: DataMartRunStatus.RUNNING,
    });

    await expect(service.run(command)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found when the run does not belong to the data mart', async () => {
    const { service, dataMartRunService } = createService();
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(null);

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects completed runs', async () => {
    const { service, dataMartRunService } = createService();
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue({
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.SUCCESS,
    });

    await expect(service.run(command)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when the run is no longer active by the time cancellation is persisted', async () => {
    const { service, dataMartRunService, connectorRunTriggerService } = createService();
    const run = {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.RUNNING,
    };
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(run);
    (dataMartRunService.markAsCancelled as jest.Mock).mockResolvedValue(false);

    await expect(service.run(command)).rejects.toBeInstanceOf(ConflictException);

    expect(connectorRunTriggerService.stopTriggersForRun).not.toHaveBeenCalled();
  });

  it('rejects report runs without report reference before updating the run', async () => {
    const { service, dataMartRunService } = createService();
    (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue({
      id: 'run-1',
      dataMartId: 'dm-1',
      reportId: null,
      type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
      status: DataMartRunStatus.RUNNING,
    });

    await expect(service.run(command)).rejects.toBeInstanceOf(ConflictException);

    expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
  });

  it('rejects users without edit access', async () => {
    const { service, accessDecisionService } = createService();
    (accessDecisionService.canAccess as jest.Mock).mockResolvedValue(false);

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
