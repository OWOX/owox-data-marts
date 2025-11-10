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

/**
 * Context for creating a new report run.
 */
export interface ReportRunContext {
  createdById: string;
  runType: RunType;
}

/**
 * Context for finalizing a report run.
 */
export interface ReportRunFinishContext {
  status: DataMartRunStatus.SUCCESS | DataMartRunStatus.FAILED | DataMartRunStatus.CANCELLED;
  logs?: string[];
  errors?: string[];
}

/**
 * Service managing the underlying DataMartRun entity lifecycle.
 *
 * Responsibilities:
 * - Creates DataMartRun entities from Report configuration
 * - Manages status transitions: PENDING → RUNNING → SUCCESS/FAILED/CANCELLED
 * - Persists execution logs and errors
 * - Captures report and data mart definition snapshots
 *
 * DataMartRun lifecycle:
 * 1. Created in PENDING or RUNNING state (depending on use case)
 * 2. Marked as RUNNING when execution begins
 * 3. Finished with final status (SUCCESS/FAILED/CANCELLED)
 *
 * State flow:
 * - Standard runs: PENDING → RUNNING → SUCCESS/FAILED/CANCELLED
 * - Looker Studio runs: RUNNING → SUCCESS/FAILED
 *
 * @see DataMartRun - The entity managed by this service
 */
@Injectable()
export class DataMartRunService {
  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly systemClock: SystemTimeService
  ) {}

  /**
   * Creates a new report run in PENDING state.
   *
   * @param report - Report entity with configuration
   * @param context - Run context (userId, runType)
   * @returns Persisted DataMartRun in PENDING status
   */
  public async createAndMarkReportRunAsPending(
    report: Report,
    context: ReportRunContext
  ): Promise<DataMartRun> {
    const dataMartRun = this.createReportRunFromReport(report, context);
    dataMartRun.status = DataMartRunStatus.PENDING;

    return this.dataMartRunRepository.save(dataMartRun);
  }

  /**
   * Creates a new report run in RUNNING state (skips PENDING).
   *
   * @param report - Report entity with configuration
   * @param context - Run context (userId, runType)
   * @returns Persisted DataMartRun in RUNNING status with startedAt timestamp
   */
  public async createAndMarkReportRunAsStarted(
    report: Report,
    context: ReportRunContext
  ): Promise<DataMartRun> {
    const dataMartRun = this.createReportRunFromReport(report, context);

    return this.markReportRunAsStarted(dataMartRun);
  }

  /**
   * Marks existing report run as RUNNING and sets start timestamp.
   *
   * @param dataMartRun - DataMartRun to mark as started
   * @returns Updated DataMartRun with RUNNING status
   */
  public async markReportRunAsStarted(dataMartRun: DataMartRun): Promise<DataMartRun> {
    dataMartRun.status = DataMartRunStatus.RUNNING;
    dataMartRun.startedAt = this.systemClock.now();

    return await this.dataMartRunRepository.save(dataMartRun);
  }

  /**
   * Finalizes report run by setting finish timestamp and optional logs/errors.
   *
   * Sets finishedAt regardless of context.
   * If context provided, also updates status, logs, and errors.
   *
   * Note: Status should already be set on dataMartRun by domain model before calling this.
   * The context parameter is optional for backward compatibility.
   *
   * @param dataMartRun - DataMartRun to finalize
   * @param context - Optional finish context with status, logs, errors to append
   */
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

  /**
   * Creates DataMartRun entity from Report configuration.
   *
   * Captures snapshot of:
   * - Report definition (title, destination config)
   * - DataMart definition (query, schema)
   * - Destination metadata
   *
   * @param report - Report entity to create run from
   * @param context - Run context (userId, runType)
   * @returns New DataMartRun entity (not persisted)
   */
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

  /**
   * Maps DataDestinationType to DataMartRunType.
   *
   * @param dataDestinationType - Destination type from Report
   * @returns Corresponding DataMartRunType
   * @throws Error if destination type is not supported
   */
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
