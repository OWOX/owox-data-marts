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
      markAsCancelled: jest.fn().mockResolvedValue(true),
      findActiveConnectorRun: jest.fn().mockResolvedValue(null),
    } as unknown as DataMartRunService;

    const connectorRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorRunTriggerService;

    const reportRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportRunTriggerService;

    const dataQualityRunService = {
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

  describe('backfill chain cancellation', () => {
    const chainMeta = (id = 'chain-1') => ({
      id,
      requestedStart: '2026-01-01',
      requestedEnd: '2026-03-03',
      segmentIndex: 1,
      segmentsTotal: 2,
    });
    const chainRun = (
      id: string,
      { chainId = 'chain-1', status = DataMartRunStatus.RUNNING } = {}
    ) => ({
      id,
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status,
      additionalParams: { payload: {}, backfill: chainMeta(chainId) },
    });
    const finished = (id: string) => chainRun(id, { status: DataMartRunStatus.SUCCESS });

    it('cancels the whole backfill by stopping its active segment run', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(chainRun('run-1'));

      await service.run(command);

      expect(dataMartRunService.markAsCancelled).toHaveBeenCalledTimes(1);
      expect(dataMartRunService.markAsCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'run-1' })
      );
      expect(connectorRunTriggerService.stopTriggersForRun).toHaveBeenCalledWith('run-1');
      expect(dataMartRunService.findActiveConnectorRun).not.toHaveBeenCalled();
    });

    it('stops the active segment when the user cancels a segment row that already finished', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(finished('run-1'));
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(chainRun('run-2'));

      await service.run(command);

      expect(dataMartRunService.markAsCancelled).toHaveBeenCalledTimes(1);
      expect(dataMartRunService.markAsCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'run-2' })
      );
      expect(connectorRunTriggerService.stopTriggersForRun).toHaveBeenCalledWith('run-2');
      expect(connectorRunTriggerService.stopTriggersForRun).not.toHaveBeenCalledWith('run-1');
    });

    it('re-reads the chain on every attempt when it advances underneath the cancel', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      // First attempt targets run-1, which finishes before the guarded update lands; the next
      // reads current data, finds run-1 finished and run-2 active, and stops run-2.
      (dataMartRunService.getByIdAndDataMartId as jest.Mock)
        .mockResolvedValueOnce(chainRun('run-1')) // reading the chain of the clicked run
        .mockResolvedValueOnce(chainRun('run-1')) // first attempt
        .mockResolvedValue(finished('run-1')); // second attempt
      (dataMartRunService.markAsCancelled as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(chainRun('run-2'));

      await service.run(command);

      expect(dataMartRunService.getByIdAndDataMartId).toHaveBeenCalledTimes(3);
      expect(dataMartRunService.markAsCancelled).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: 'run-1' })
      );
      expect(dataMartRunService.markAsCancelled).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ id: 'run-2' })
      );
      expect(connectorRunTriggerService.stopTriggersForRun).toHaveBeenCalledTimes(1);
      expect(connectorRunTriggerService.stopTriggersForRun).toHaveBeenCalledWith('run-2');
    });

    it('conflicts when the chain already ended and nothing is active', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(finished('run-1'));
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(null);

      await expect(service.run(command)).rejects.toThrow(ConflictException);
      expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.stopTriggersForRun).not.toHaveBeenCalled();
    });

    it('conflicts when the run finishes during the cancel and the chain does not go on', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock)
        .mockResolvedValueOnce(chainRun('run-1'))
        .mockResolvedValueOnce(chainRun('run-1'))
        .mockResolvedValue(finished('run-1'));
      (dataMartRunService.markAsCancelled as jest.Mock).mockResolvedValue(false);
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(null);

      await expect(service.run(command)).rejects.toThrow(ConflictException);
      expect(connectorRunTriggerService.stopTriggersForRun).not.toHaveBeenCalled();
    });

    it('does not cancel an active run that belongs to a different backfill', async () => {
      const { service, dataMartRunService, connectorRunTriggerService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(finished('run-1'));
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(
        chainRun('run-9', { chainId: 'chain-other' })
      );

      await expect(service.run(command)).rejects.toThrow(ConflictException);
      expect(dataMartRunService.markAsCancelled).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.stopTriggersForRun).not.toHaveBeenCalled();
    });

    it('gives up after a bounded number of attempts on a chain that keeps advancing', async () => {
      const { service, dataMartRunService } = createService();
      (dataMartRunService.getByIdAndDataMartId as jest.Mock).mockResolvedValue(finished('run-1'));
      (dataMartRunService.markAsCancelled as jest.Mock).mockResolvedValue(false);
      (dataMartRunService.findActiveConnectorRun as jest.Mock).mockResolvedValue(chainRun('run-2'));

      await expect(service.run(command)).rejects.toThrow(ConflictException);
      expect(dataMartRunService.markAsCancelled).toHaveBeenCalledTimes(3);
    });
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

  it('does not apply generic cancellation when Data Quality cancellation fails', async () => {
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
      new Error('transaction failed')
    );

    await expect(service.run(command)).rejects.toThrow('transaction failed');

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
