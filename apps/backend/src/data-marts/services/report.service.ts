import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { LookerStudioConnectorCredentialsType } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-credentials.schema';
import { Report } from '../entities/report.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ScheduledTriggerService } from './scheduled-trigger.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';

/**
 * Service managing Report entity persistence and queries.
 *
 * Responsibilities:
 * - Fetches reports with relationships (dataMart, dataDestination)
 * - Updates report run status after execution
 * - Manages report lifecycle (deletion with cascade)
 * - Provides Looker Studio-specific queries with secret validation
 *
 * @see Report - Entity managed by this service
 */
@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly repository: Repository<Report>,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly systemTimeService: SystemTimeService
  ) {}

  /**
   * Fetches report by ID with related entities.
   *
   * @param id - Report identifier
   * @returns Report with dataMart and dataDestination relations
   * @throws NotFoundException if report not found
   */
  async getById(id: string): Promise<Report> {
    const report = await this.repository.findOne({
      where: { id },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    return report;
  }

  /**
   * Fetches report by ID with ownership validation. Ensures report belongs to specified dataMart and project.
   *
   * @param id - Report identifier
   * @param dataMartId - Expected dataMart ID
   * @param projectId - Expected project ID
   * @returns Report with relations
   * @throws NotFoundException if report not found or doesn't match ownership
   */
  async getByIdAndDataMartIdAndProjectId(
    id: string,
    dataMartId: string,
    projectId: string
  ): Promise<Report> {
    const report = await this.repository.findOne({
      where: {
        id,
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart', 'dataDestination'],
    });

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    return report;
  }

  /**
   * Fetches all Looker Studio reports for destination with secret validation.
   *
   * @param destinationId - Data destination ID
   * @param secret - Destination secret key for authentication
   * @returns Array of reports matching destination and secret
   */
  async getAllByDestinationIdAndLookerStudioSecret(
    destinationId: string,
    secret: string
  ): Promise<Report[]> {
    return await this.repository
      .createQueryBuilder('report')
      .innerJoinAndSelect('report.dataDestination', 'dest')
      .innerJoinAndSelect('report.dataMart', 'dataMart')
      .innerJoin(
        'data_destination_credentials',
        'cred',
        'cred.id = dest.credentialId AND cred.deletedAt IS NULL'
      )
      .where('dest.type = :destType', { destType: DataDestinationType.LOOKER_STUDIO })
      .andWhere('dest.id = :destinationId', { destinationId })
      .andWhere(`JSON_EXTRACT(cred.credentials, '$.type') = :credType`, {
        credType: LookerStudioConnectorCredentialsType,
      })
      .andWhere(`JSON_EXTRACT(cred.credentials, '$.destinationSecretKey') = :secret`, {
        secret,
      })
      .getMany();
  }

  /**
   * Fetches single Looker Studio report with secret validation.
   *
   * @param id - Report identifier
   * @param secret - Destination secret key for authentication
   * @returns Report if found and secret matches, null otherwise
   */
  async getByIdAndLookerStudioSecret(id: string, secret: string): Promise<Report | null> {
    return (
      (await this.repository
        .createQueryBuilder('report')
        .innerJoinAndSelect('report.dataDestination', 'dest')
        .innerJoinAndSelect('report.dataMart', 'dataMart')
        .innerJoin(
          'data_destination_credentials',
          'cred',
          'cred.id = dest.credentialId AND cred.deletedAt IS NULL'
        )
        .where('report.id = :id', { id })
        .andWhere('dest.type = :destType', { destType: DataDestinationType.LOOKER_STUDIO })
        .andWhere(`JSON_EXTRACT(cred.credentials, '$.type') = :credType`, {
          credType: LookerStudioConnectorCredentialsType,
        })
        .andWhere(`JSON_EXTRACT(cred.credentials, '$.destinationSecretKey') = :secret`, {
          secret,
        })
        .getOne()) ?? null
    );
  }

  /**
   * Updates report run status after execution completes.
   *
   * @param reportId - Report identifier
   * @param status - Final run status
   * @param error - Optional error message for failed runs
   */
  async updateRunStatus(reportId: string, status: ReportRunStatus, error?: string): Promise<void> {
    await this.repository.update(reportId, {
      lastRunAt: this.systemTimeService.now(),
      lastRunStatus: status,
      lastRunError: error ? error : () => 'NULL',
      runsCount: () => 'runsCount + 1',
    });
  }

  /**
   * Persists Report entity changes.
   *
   * @param report - Report entity to save
   */
  async saveReport(report: Report): Promise<void> {
    await this.repository.save(report);
  }

  /**
   * Updates report fields with optimistic locking (version control).
   *
   * Atomically updates lastRunAt, lastRunError, lastRunStatus, runsCount, and increments version.
   * Throws OptimisticLockVersionMismatchError if the report was concurrently modified.
   *
   * @param report - Report entity with updated fields and current version
   * @throws OptimisticLockVersionMismatchError if version in DB does not match entity version
   */
  async updateReportWithVersionControl(report: Report): Promise<void> {
    const { id, lastRunAt, lastRunError, lastRunStatus, runsCount, version } = report;

    const nextVersion = version + 1;
    const result = await this.repository
      .createQueryBuilder()
      .update(Report)
      .set({
        lastRunAt,
        lastRunError,
        lastRunStatus,
        runsCount,
        version: () => 'version + 1',
      })
      .where('id = :id AND version = :version', { id, version })
      .execute();

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError('Report', version, nextVersion);
    }

    // Update local entity version to match database
    report.version = nextVersion;
  }

  /**
   * Deletes report with cascade to triggers.
   *
   * Steps:
   * 1. Deletes all scheduled triggers for report
   * 2. Removes report entity
   *
   * @param report - Report to delete (must have dataMart relation loaded)
   */
  async deleteReport(report: Report): Promise<void> {
    // Delete all triggers related to this report
    await this.scheduledTriggerService.deleteAllByReportIdAndDataMartIdAndProjectId(
      report.id,
      report.dataMart.id,
      report.dataMart.projectId
    );

    // Delete report
    await this.repository.remove(report);
  }

  /**
   * Deletes all reports for data mart with cascade.
   *
   * Used when deleting data mart to clean up dependent reports.
   *
   * @param dataMartId - DataMart identifier
   * @param projectId - Project identifier for ownership validation
   */
  async deleteAllByDataMartIdAndProjectId(dataMartId: string, projectId: string): Promise<void> {
    const reports = await this.repository.find({
      where: {
        dataMart: {
          id: dataMartId,
          projectId,
        },
      },
      relations: ['dataMart'],
    });

    for (const report of reports) {
      await this.deleteReport(report);
    }
  }
}
