import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { TypeResolver } from '../../../../common/resolver/type-resolver';
import { BigQueryReportReader } from "../../../data-storage-types/bigquery/services/bigquery-report-reader.service";
import { DATA_STORAGE_REPORT_READER_RESOLVER } from '../../../data-storage-types/data-storage-providers';
import { DataStorageType } from "../../../data-storage-types/enums/data-storage-type.enum";
import { DataStorageReportReader } from '../../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { Report } from '../../../entities/report.entity';
import { isLookerStudioConnectorConfig } from '../../data-destination-config.guards';
import { ReportDataCache } from '../entities/report-data-cache.entity';
import { 
  ReaderState, 
  BigQueryReaderState, 
  AthenaReaderState,
  isBigQueryReaderState,
  isAthenaReaderState
} from '../interfaces/reader-state.interface';

/**
 * Service for managing persistent cache of report data readers
 */
@Injectable()
export class ReportDataCacheService {
  private readonly logger = new Logger(ReportDataCacheService.name);

  constructor(
    @InjectRepository(ReportDataCache)
    private readonly cacheRepository: Repository<ReportDataCache>,
    @Inject(DATA_STORAGE_REPORT_READER_RESOLVER)
    private readonly readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>
  ) {}

  /**
   * Gets cached reader or creates new one if cache miss
   */
  async getOrCreateCachedReader(report: Report): Promise<{
    reader: DataStorageReportReader;
    dataDescription: ReportDataDescription;
    fromCache: boolean;
  }> {
    const now = new Date();
    
    // Try to find cached data
    const cachedData = await this.cacheRepository.findOne({
      where: { 
        id: report.id,
        expiresAt: MoreThan(now)
      }
    });

    if (cachedData) {
      this.logger.debug(`Cache hit for report ${report.id}`);
      const reader = await this.restoreReaderFromCache(cachedData, report);
      
      return {
        reader,
        dataDescription: cachedData.dataDescription,
        fromCache: true
      };
    }

    this.logger.debug(`Cache miss for report ${report.id}, creating new reader`);

    // Create new reader and cache it
    const reader = await this.readerResolver.resolve(report.dataMart.storage.type);
    const dataDescription = await reader.prepareReportData(report);
    await reader.readReportDataBatch(undefined, 0);
    const readerState = this.serializeReaderState(reader);
    
    // Get cache lifetime from report settings
    const cacheLifetime = this.getCacheLifetime(report);
    const expiresAt = new Date(Date.now() + cacheLifetime * 1000);
    
    // Save to cache
    await this.cacheRepository.save({
      id: report.id,
      dataDescription,
      readerState,
      storageType: report.dataMart.storage.type,
      expiresAt
    });

    return {
      reader,
      dataDescription,
      fromCache: false
    };
  }

  /**
   * Invalidates cache for specific report
   */
  async invalidateCache(reportId: string): Promise<void> {
    this.logger.debug(`Invalidating cache for report ${reportId}`);
    await this.cacheRepository.delete({ id: reportId });
  }

  /**
   * Cleans up expired cache entries
   */
  async cleanupExpiredCache(): Promise<void> {
    const now = new Date();
    
    const result = await this.cacheRepository.delete({
      expiresAt: LessThan(now)
    });
    
    if (result.affected && result.affected > 0) {
      this.logger.debug(`Cleaned up ${result.affected} expired cache entries`);
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
   * Serializes reader state in a type-safe manner
   */
  private serializeReaderState(reader: DataStorageReportReader): ReaderState | null {
    if (reader.type === DataStorageType.GOOGLE_BIGQUERY) {
      return this.serializeBigQueryReaderState(reader);
    }
    
    if (reader.type === DataStorageType.AWS_ATHENA) {
      return this.serializeAthenaReaderState(reader);
    }

    this.logger.warn(`Unsupported storage type for caching: ${reader.type}`);
    return null;
  }

  /**
   * Serializes BigQuery reader state
   */
  private serializeBigQueryReaderState(reader: DataStorageReportReader): BigQueryReaderState {
    const readerWithState = reader as BigQueryReportReader;
    return {
      type: DataStorageType.GOOGLE_BIGQUERY,
      reportResultTable: readerWithState.reportResultTable ? {
        projectId: readerWithState.reportResultTable.dataset.projectId!,
        datasetId: readerWithState.reportResultTable.dataset.id!,
        tableId: readerWithState.reportResultTable.id!
      } : undefined,
      contextGcpProject: readerWithState.contextGcpProject
    };
  }

  /**
   * Serializes Athena reader state
   */
  private serializeAthenaReaderState(reader: DataStorageReportReader): AthenaReaderState {
    const readerWithState = reader as unknown as {
      queryExecutionId?: string;
      outputBucket: string;
      outputPrefix: string;
    };

    return {
      type: DataStorageType.AWS_ATHENA,
      queryExecutionId: readerWithState.queryExecutionId,
      outputBucket: readerWithState.outputBucket,
      outputPrefix: readerWithState.outputPrefix
    };
  }

  /**
   * Restores reader from cached state
   */
  private async restoreReaderFromCache(cachedData: ReportDataCache, report: Report): Promise<DataStorageReportReader> {
    const reader = await this.readerResolver.resolve(cachedData.storageType);
    
    // Initialize reportConfig from current report
    await this.initializeReportConfig(reader, report);
    
    if (!cachedData.readerState) {
      this.logger.warn(`No reader state found in cache for report ${cachedData.id}`);
      return reader;
    }

    const state = cachedData.readerState;
    
    if (isBigQueryReaderState(state) && cachedData.storageType === DataStorageType.GOOGLE_BIGQUERY) {
      this.restoreBigQueryReaderState(reader, state);
    } else if (isAthenaReaderState(state) && cachedData.storageType === DataStorageType.AWS_ATHENA) {
      this.restoreAthenaReaderState(reader, state);
    } else {
      this.logger.warn(`Mismatched reader state type for storage ${cachedData.storageType}`);
    }

    return reader;
  }

  /**
   * Initializes reportConfig from current report
   */
  private async initializeReportConfig(reader: DataStorageReportReader, report: Report): Promise<void> {
    // Call prepareReportData to initialize reportConfig
    await reader.prepareReportData(report);
  }

  /**
   * Restores BigQuery reader state
   */
  private restoreBigQueryReaderState(reader: DataStorageReportReader, state: BigQueryReaderState): void {
    const readerWithState = reader as BigQueryReportReader;
    if (state.reportResultTable && readerWithState.adapter) {
      readerWithState.reportResultTable = readerWithState.adapter.createTableReference(
        state.reportResultTable.projectId,
        state.reportResultTable.datasetId,
        state.reportResultTable.tableId
      );
    }

    readerWithState.contextGcpProject = state.contextGcpProject;
  }

  /**
   * Restores Athena reader state
   */
  private restoreAthenaReaderState(reader: DataStorageReportReader, state: AthenaReaderState): void {
    const readerWithState = reader as unknown as {
      queryExecutionId?: string;
      outputBucket: string;
      outputPrefix: string;
    };

    readerWithState.queryExecutionId = state.queryExecutionId;
    readerWithState.outputBucket = state.outputBucket;
    readerWithState.outputPrefix = state.outputPrefix;
  }
}
