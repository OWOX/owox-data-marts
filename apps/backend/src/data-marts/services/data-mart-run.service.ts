import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { Report } from '../entities/report.entity';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';

export interface ReportRunContext {
  createdById: string;
  runType: RunType;
}

export interface ReportRunFinishContext {
  status: DataMartRunStatus.SUCCESS | DataMartRunStatus.FAILED | DataMartRunStatus.CANCELLED;
  logs?: string[];
  errors?: string[];
}

@Injectable()
export class DataMartRunService {
  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly systemClock: SystemTimeService
  ) {}

  public async createAndMarkReportRunAsPending(
    report: Report,
    context: ReportRunContext
  ): Promise<DataMartRun> {
    const dataMartRun = this.createReportRunFromReport(report, context);
    dataMartRun.status = DataMartRunStatus.PENDING;

    return this.dataMartRunRepository.save(dataMartRun);
  }

  public async createAndMarkReportRunAsStarted(
    report: Report,
    context: ReportRunContext
  ): Promise<DataMartRun> {
    const dataMartRun = this.createReportRunFromReport(report, context);

    return this.markReportRunAsStarted(dataMartRun);
  }

  public async markReportRunAsStarted(dataMartRun: DataMartRun): Promise<DataMartRun> {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = this.systemClock.now();

    return await this.dataMartRunRepository.save(dataMartRun);
  }

  public async markReportRunAsFinished(
    dataMartRun: DataMartRun,
    context?: ReportRunFinishContext
  ): Promise<void> {
    if (context) {
      dataMartRun.status = context.status;

      if (context.logs) {
        dataMartRun.logs = dataMartRun.logs?.concat(context.logs);
      }

      if (context.errors) {
        dataMartRun.errors = dataMartRun.errors?.concat(context.errors);
      }
    }
    dataMartRun.finishedAt = this.systemClock.now();

    await this.dataMartRunRepository.save(dataMartRun);
  }

  private createReportRunFromReport(report: Report, context: ReportRunContext): DataMartRun {
    const { id, title, dataMart, destinationConfig, dataDestination } = report;

    const reportDefinition = {
      title,
      destination: {
        id: dataDestination.id,
        type: dataDestination.type,
        title: dataDestination.title,
      },
      destinationConfig,
    };

    const dataMartRunDraft = {
      dataMartId: dataMart.id,
      type: this.defineTypeFromDataDestinationType(dataDestination.type),
      reportId: id,
      definitionRun: dataMart.definition,
      createdById: context.createdById,
      runType: context.runType,
      logs: [],
      errors: [],
      reportDefinition,
    };

    const dataMartRun = this.dataMartRunRepository.create(dataMartRunDraft);

    return dataMartRun;
  }

  private defineTypeFromDataDestinationType(
    dataDestinationType: DataDestinationType
  ): DataMartRunType {
    switch (dataDestinationType) {
      case DataDestinationType.GOOGLE_SHEETS:
        return DataMartRunType.GOOGLE_SHEETS_EXPORT;
      case DataDestinationType.LOOKER_STUDIO:
        return DataMartRunType.LOOKER_STUDIO;
      default:
        throw Error(`Unexpected Data Destination Type - ${dataDestinationType}`);
    }
  }
}
