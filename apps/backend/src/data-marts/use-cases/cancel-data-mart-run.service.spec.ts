jest.mock('typeorm-transactional', () => ({
  Transactional: jest.fn(
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor
  ),
}));

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService } from '../services/access-decision';
import { CancelDataMartRunService } from './cancel-data-mart-run.service';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import { ReportService } from '../services/report.service';

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
    } as unknown as DataMartRunService;

    const connectorRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorRunTriggerService;

    const reportRunTriggerService = {
      stopTriggersForRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportRunTriggerService;

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
      reportService,
      accessDecisionService
    );

    return {
      service,
      dataMartService,
      dataMartRunService,
      connectorRunTriggerService,
      reportRunTriggerService,
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

  it('runs cancellation state changes in a transaction', () => {
    expect(Transactional).toHaveBeenCalled();
  });

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
