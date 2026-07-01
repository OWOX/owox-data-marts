import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FindOptionsWhere, Repository, MoreThan, LessThan } from 'typeorm';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  DataStorageReportReader,
  PrepareReportDataOptions,
} from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { CachedReaderData } from '../dto/domain/cached-reader-data.dto';
import { Report } from '../entities/report.entity';
import { isLookerStudioConnectorConfig } from '../data-destination-types/data-destination-config.guards';
import { ReportDataCache } from '../entities/report-data-cache.entity';
import { BlendableSchemaAccessor } from './blendable-schema.service';
import { BlendedReportDataService } from './blended-report-data.service';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { hasOutputControls } from '../dto/domain/report-like-read-plan';
import { ReportSqlComposerService } from './report-sql-composer.service';

/**
 * Service for managing persistent cache of report data readers
 */
@Injectable()
export class ReportDataCacheService {
  private readonly logger = new Logger(ReportDataCacheService.name);

  private readonly pendingOperations = new Map<string, Promise<CachedReaderData>>();

  constructor(
    @InjectRepository(ReportDataCache)
    private readonly cacheRepository: Repository<ReportDataCache>,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>,
    private readonly blendedReportDataService: BlendedReportDataService,
    private readonly reportSqlComposerService: ReportSqlComposerService
  ) {}

  /**
   * Resolves the column-filter / SQL-override hints that readers need from
   * the current state of the report. Returned alongside the raw
   * `BlendingDecision` so callers can attach it to `CachedReaderData`
   * without issuing a second metadata resolution.
   */
  private async resolvePrepareOptions(
    report: Report,
    accessor: BlendableSchemaAccessor
  ): Promise<{ options: PrepareReportDataOptions; decision: BlendingDecision }> {
    const decision = await this.blendedReportDataService.resolveBlendingDecision(report, accessor);

    let sqlOverride = decision.needsBlending ? decision.blendedSql : undefined;
    let sqlOverrideParams = decision.needsBlending ? decision.params : undefined;

    // Non-blended reports with output controls must compose their filter/sort/limit
    // SQL + bound params here, exactly as RunReportService does — otherwise this
    // (Looker Studio) cached-reader path drops them, and Athena's positional `?`
    // placeholders execute unbound.
    if (!decision.needsBlending && hasOutputControls(report)) {
      const composed = await this.reportSqlComposerService.compose(report, accessor, decision);
      sqlOverride = composed.sql;
      sqlOverrideParams = composed.params;
    }

    return {
      options: {
        sqlOverride,
        sqlOverrideParams,
        columnFilter: decision.columnFilter,
        blendedDataHeaders: decision.blendedDataHeaders,
        aggregationConfig: report.aggregationConfig ?? undefined,
        uniqueCount: report.uniqueCountConfig ?? undefined,
      },
      decision,
    };
  }

  /**
   * Gets cached reader or creates new one if cache miss
   */
  async getOrCreateCachedReader(
    report: Report,
    accessor: BlendableSchemaAccessor
  ): Promise<CachedReaderData> {
    const reportId = report.id;

    const existingOperation = this.pendingOperations.get(reportId);
    if (existingOperation) {
      this.logger.debug(`Waiting for existing operation for report ${reportId}`);
      return existingOperation;
    }

    const operationPromise = this.executeGetOrCreateOperation(report, accessor);
    this.pendingOperations.set(reportId, operationPromise);

    try {
      return await operationPromise;
    } finally {
      this.pendingOperations.delete(reportId);
    }
  }

  private async executeGetOrCreateOperation(
    report: Report,
    accessor: BlendableSchemaAccessor
  ): Promise<CachedReaderData> {
    const now = new Date();
    const { options, decision } = await this.resolvePrepareOptions(report, accessor);

    // Best-effort: executionSqlQuery is display-only run-history metadata, so a failure
    // to render it must never abort the data fetch.
    let executionSqlQuery: string | undefined;
    if (options.sqlOverride) {
      try {
        executionSqlQuery = this.reportSqlComposerService.inlineStaticSql(
          report.dataMart.storage.type,
          options.sqlOverride,
          options.sqlOverrideParams
        );
      } catch (error) {
        this.logger.warn(
          `Failed to record executionSqlQuery for report ${report.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    const cachedData = await this.cacheRepository.findOne({
      where: {
        report: { id: report.id },
        expiresAt: MoreThan(now),
      },
      relations: ['report'],
      order: { createdAt: 'DESC' },
    });

    if (cachedData) {
      this.logger.debug(`Cache hit for report ${report.id}`);
      const reader = await this.restoreReaderFromCache(cachedData, report, options);

      return {
        reader,
        dataDescription: cachedData.dataDescription,
        fromCache: true,
        blendingDecision: decision,
        executionSqlQuery,
      };
    }

    return { ...(await this.createNewCachedReader(report, options, decision)), executionSqlQuery };
  }

  private async createNewCachedReader(
    report: Report,
    options: PrepareReportDataOptions,
    decision: BlendingDecision
  ): Promise<CachedReaderData> {
    this.logger.debug(`Cache miss for report ${report.id}, creating new reader`);

    const reader = await this.readerResolver.resolve(report.dataMart.storage.type);
    const dataDescription = await reader.prepareReportData(report, options);
    await reader.readReportDataBatch(undefined, 1);
    const readerState = reader.getState();

    const cacheLifetime = this.getCacheLifetime(report);
    const expiresAt = new Date(Date.now() + cacheLifetime * 1000);

    await this.cacheRepository.save({
      report,
      dataDescription,
      readerState,
      storageType: report.dataMart.storage.type,
      expiresAt,
    });

    return {
      reader,
      dataDescription,
      fromCache: false,
      blendingDecision: decision,
    };
  }

  private static readonly CACHE_ENTRY_RELATIONS = [
    'report',
    'report.dataMart',
    'report.dataMart.storage',
    'report.dataMart.storage.credential',
  ];

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredCache(): Promise<void> {
    const where: FindOptionsWhere<ReportDataCache> = { expiresAt: LessThan(new Date()) };

    const expiredEntries = await this.cacheRepository.find({
      where,
      relations: ReportDataCacheService.CACHE_ENTRY_RELATIONS,
    });

    if (expiredEntries.length === 0) {
      return;
    }

    this.logger.log(`Found ${expiredEntries.length} expired cache entries to cleanup`);
    await this.finalizeEntriesInParallel(expiredEntries);

    const result = await this.cacheRepository.delete(where);
    this.logger.log(`Cleaned up ${result.affected || 0} expired cache entries`);
  }

  private async finalizeEntriesInParallel(entries: ReportDataCache[]): Promise<void> {
    const outcomes = await Promise.allSettled(
      entries.map(entry => this.finalizeExpiredCacheEntry(entry))
    );
    for (const [index, outcome] of outcomes.entries()) {
      if (outcome.status === 'rejected') {
        this.logger.warn(
          `Failed to finalize cache entry ${entries[index].id}: ${outcome.reason?.message ?? outcome.reason}`
        );
      }
    }
  }

  /**
   * Finalizes expired cache entry by creating reader and calling finalize.
   *
   * Athena is currently the only reader with external cached artifacts that can be
   * finalized safely from persisted state (S3 result files). Other readers either
   * finalize as a no-op or need prepareReportData to start a fresh query/cursor
   * before initFromState, so cleanup must not restore them just to delete the cache row.
   */
  private async finalizeExpiredCacheEntry(cacheEntry: ReportDataCache): Promise<void> {
    try {
      if (!cacheEntry.readerState) {
        this.logger.debug(`No reader state to finalize for cache entry ${cacheEntry.id}`);
        return;
      }

      if (cacheEntry.storageType !== DataStorageType.AWS_ATHENA) {
        this.logger.debug(
          `Skipping reader finalization for cache entry ${cacheEntry.id}: ${cacheEntry.storageType} has no cleanup-safe cached-state finalizer`
        );
        return;
      }

      const reader = await this.restoreReaderFromCache(cacheEntry, cacheEntry.report, {});
      await reader.finalize();
      this.logger.debug(`Successfully finalized reader for cache entry ${cacheEntry.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to finalize reader for cache entry ${cacheEntry.id}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Gets cache lifetime from report configuration
   */
  private getCacheLifetime(report: Report): number {
    if (isLookerStudioConnectorConfig(report.destinationConfig)) {
      return report.destinationConfig.cacheLifetime;
    }

    // Default to 1 hour if not configured
    return 3600;
  }

  /**
   * Restores reader from cached state. The read path supplies resolved prepare
   * options; the cleanup path passes empty options because the cached state
   * carries everything finalize needs.
   */
  private async restoreReaderFromCache(
    cachedData: ReportDataCache,
    report: Report,
    options: PrepareReportDataOptions
  ): Promise<DataStorageReportReader> {
    const reader = await this.readerResolver.resolve(cachedData.storageType);
    await reader.prepareReportData(report, options);
    if (cachedData.readerState) {
      await reader.initFromState(cachedData.readerState, cachedData.dataDescription.dataHeaders);
    }
    return reader;
  }

  async invalidateByReportId(reportId: string): Promise<void> {
    await this.invalidateWhere({ report: { id: reportId } }, `report ${reportId}`);
  }

  async invalidateByDataMartId(dataMartId: string): Promise<void> {
    await this.invalidateWhere(
      { report: { dataMart: { id: dataMartId } } },
      `data mart ${dataMartId}`
    );
  }

  private async invalidateWhere(
    where: FindOptionsWhere<ReportDataCache>,
    contextLabel: string
  ): Promise<void> {
    const entries = await this.cacheRepository.find({
      where,
      relations: ReportDataCacheService.CACHE_ENTRY_RELATIONS,
    });

    if (entries.length === 0) return;

    await this.finalizeEntriesInParallel(entries);

    const result = await this.cacheRepository.delete(where);
    if (result.affected && result.affected > 0) {
      this.logger.log(`Invalidated ${result.affected} cache entries for ${contextLabel}`);
    }
  }
}
