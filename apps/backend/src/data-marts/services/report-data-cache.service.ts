import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../data-storage-types/data-storage-providers';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../data-storage-types/interfaces/data-storage-report-reader.interface';
import { CachedReaderData } from '../dto/domain/cached-reader-data.dto';
import { Report } from '../entities/report.entity';
import { isLookerStudioConnectorConfig } from '../data-destination-types/data-destination-config.guards';
import { ReportDataCache } from '../entities/report-data-cache.entity';

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
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>
  ) {}

  /**
   * Gets cached reader or creates new one if cache miss
   */
  async getOrCreateCachedReader(report: Report): Promise<CachedReaderData> {
    const reportId = report.id;

    const existingOperation = this.pendingOperations.get(reportId);
    if (existingOperation) {
      this.logger.debug(`Waiting for existing operation for report ${reportId}`);
      return existingOperation;
    }

    const operationPromise = this.executeGetOrCreateOperation(report);
    this.pendingOperations.set(reportId, operationPromise);

    try {
      return await operationPromise;
    } finally {
      this.pendingOperations.delete(reportId);
    }
  }

  private async executeGetOrCreateOperation(report: Report): Promise<CachedReaderData> {
    const now = new Date();

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
      const reader = await this.restoreReaderFromCache(cachedData, report);

      return {
        reader,
        dataDescription: cachedData.dataDescription,
        fromCache: true,
      };
    }

    return this.createNewCachedReader(report);
  }

  private async createNewCachedReader(report: Report): Promise<CachedReaderData> {
    this.logger.debug(`Cache miss for report ${report.id}, creating new reader`);

    const reader = await this.readerResolver.resolve(report.dataMart.storage.type);
    const dataDescription = await reader.prepareReportData(report);
    await reader.readReportDataBatch(undefined, 0);
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
    };
  }

  /**
   * Cleans up expired cache entries with proper finalization
   * Called actively by scheduler every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredCache(): Promise<void> {
    const now = new Date();

    const expiredEntries = await this.cacheRepository.find({
      where: {
        expiresAt: LessThan(now),
      },
      relations: ['report', 'report.dataMart', 'report.dataMart.storage'],
    });

    if (expiredEntries.length === 0) {
      return;
    }

    this.logger.log(`Found ${expiredEntries.length} expired cache entries to cleanup`);

    for (const entry of expiredEntries) {
      try {
        await this.finalizeExpiredCacheEntry(entry);
      } catch (error) {
        this.logger.error(
          `Failed to finalize cache entry ${entry.id}: ${error.message}`,
          error.stack
        );
      }
    }

    const result = await this.cacheRepository.delete({
      expiresAt: LessThan(now),
    });

    this.logger.log(`Cleaned up ${result.affected || 0} expired cache entries`);
  }

  /**
   * Finalizes expired cache entry by creating reader and calling finalize
   */
  private async finalizeExpiredCacheEntry(cacheEntry: ReportDataCache): Promise<void> {
    try {
      if (cacheEntry.readerState) {
        const reader = await this.restoreReaderFromCache(cacheEntry, cacheEntry.report);
        await reader.finalize();
      }
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
   * Restores reader from cached state
   */
  private async restoreReaderFromCache(
    cachedData: ReportDataCache,
    report: Report
  ): Promise<DataStorageReportReader> {
    const reader = await this.readerResolver.resolve(cachedData.storageType);
    await reader.prepareReportData(report);
    if (cachedData.readerState) {
      await reader.initFromState(cachedData.readerState);
    }
    return reader;
  }
}
