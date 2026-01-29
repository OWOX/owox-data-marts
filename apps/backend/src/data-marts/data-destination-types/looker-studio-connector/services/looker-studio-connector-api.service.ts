import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { OwoxProducer } from '@owox/internal-helpers';
import { Response } from 'express';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../../../common/exceptions/project-operation-blocked.exception';
import { OWOX_PRODUCER } from '../../../../common/producer/producer.module';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { Report } from '../../../entities/report.entity';
import { LookerReportRunSuccessfullyEvent } from '../../../events/looker-report-run-successfully.event';
import { LookerStudioReportRun } from '../../../models/looker-studio-report-run.model';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import { LookerStudioReportRunService } from '../../../services/looker-studio-report-run.service';
import { ProjectBalanceService } from '../../../services/project-balance.service';
import { ReportDataCacheService } from '../../../services/report-data-cache.service';
import { ReportService } from '../../../services/report.service';
import { ConnectionConfigSchema } from '../schemas/connection-config.schema';
import { ConnectorRequestConfigV1Schema } from '../schemas/connector-request-config.schema.v1';
import { GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';
import { GetDataRequest, GetDataResponse } from '../schemas/get-data.schema';
import { GetSchemaRequest, GetSchemaResponse } from '../schemas/get-schema.schema';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';

interface ValidatedRequestData {
  connectionConfig: { destinationSecretKey: string };
  requestConfig: { reportId: string };
}

/**
 * Main service for handling Looker Studio Community Connector API requests.
 *
 * Implements the Looker Studio Community Connector protocol, handling three main requests:
 * - getConfig: Returns connector configuration UI
 * - getSchema: Returns available fields/dimensions/metrics
 * - getData: Returns actual report data
 *
 * Responsibilities:
 * - Request validation and authentication via secret key
 * - Report run lifecycle management (create, execute, finish)
 * - Distinguishing between sample (preview) and full data requests
 * - Consumption tracking and event publishing
 * - Coordinating between config/schema/data sub-services
 *
 * Data flow for getData (full extraction):
 * 1. Validate request and authenticate via secret
 * 2. Create LookerStudioReportRun in transaction
 * 3. Fetch data via LookerStudioConnectorApiDataService
 * 4. Mark run as success/failure
 * 5. Track consumption and publish success event
 * 6. Persist results in transaction
 *
 * Note: Sample extractions skip run tracking for performance.
 *
 * @see LookerStudioConnectorApiConfigService - Handles getConfig
 * @see LookerStudioConnectorApiSchemaService - Handles getSchema
 * @see LookerStudioConnectorApiDataService - Handles getData
 * @see LookerStudioReportRunService - Manages report run lifecycle
 */
@Injectable()
export class LookerStudioConnectorApiService {
  private readonly logger = new Logger(LookerStudioConnectorApiService.name);

  constructor(
    private readonly configService: LookerStudioConnectorApiConfigService,
    private readonly schemaService: LookerStudioConnectorApiSchemaService,
    private readonly dataService: LookerStudioConnectorApiDataService,
    private readonly cacheService: ReportDataCacheService,
    private readonly reportService: ReportService,
    private readonly consumptionTrackingService: ConsumptionTrackingService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly lookerStudioReportRunService: LookerStudioReportRunService,
    private readonly projectBalanceService: ProjectBalanceService
  ) {}

  /**
   * Handles getConfig request from Looker Studio.
   * Returns connector configuration UI definition.
   *
   * @param request - Looker Studio getConfig request
   * @returns Configuration response with UI elements
   */
  public async getConfig(request: GetConfigRequest): Promise<GetConfigResponse> {
    return this.configService.getConfig(request);
  }

  /**
   * Handles getSchema request from Looker Studio.
   * Returns available fields (dimensions and metrics) for the report.
   *
   * @param request - Looker Studio getSchema request with authentication
   * @returns Schema response with field definitions
   */
  public async getSchema(request: GetSchemaRequest): Promise<GetSchemaResponse> {
    // Get report and cached reader centrally
    const { report, cachedReader } = await this.getReportAndCachedReader(request);

    // Pass cached data to schema service
    return this.schemaService.getSchema(request, report, cachedReader);
  }

  /**
   * Handles getData request from Looker Studio.
   * Returns actual report data, either as sample preview or full extraction.
   *
   * Sample extraction (sampleExtraction=true):
   * - Returns up to 100 rows for preview
   * - Does not create report run or track consumption
   *
   * Full extraction (sampleExtraction=false):
   * - Creates LookerStudioReportRun and tracks execution
   * - Publishes success event on completion
   * - Tracks consumption for billing
   *
   * @param request - Looker Studio getData request with field selection
   * @returns Data response with rows and schema
   */
  public async getData(request: GetDataRequest): Promise<GetDataResponse> {
    // Get report and cached reader centrally
    const { report, cachedReader } = await this.getReportAndCachedReader(request);
    const isSampleExtraction = Boolean(request.request.scriptParams?.sampleExtraction);

    return isSampleExtraction
      ? await this.getSampleDataExtraction(request, report, cachedReader)
      : await this.getFullDataExtraction(request, report, cachedReader);
  }

  /**
   * Checks if streaming is enabled via environment variable.
   * Default is false (non-streaming) for backward compatibility.
   */
  private isStreamingEnabled(): boolean {
    return process.env.LOOKER_STREAMING_ENABLED === 'true';
  }

  /**
   * Handles getData request with optional streaming response.
   * Uses streaming when LOOKER_STREAMING_ENABLED=true environment variable is set.
   *
   * Streaming benefits:
   * - Peak memory: ~1000 rows vs up to 1M rows
   * - Faster time-to-first-byte for large datasets
   * - Better handling of memory-constrained environments
   *
   * @param request - Looker Studio getData request
   * @param res - Express response object for streaming
   */
  public async getDataStreaming(request: GetDataRequest, res: Response): Promise<void> {
    const { report, cachedReader } = await this.getReportAndCachedReader(request);
    const isSampleExtraction = Boolean(request.request.scriptParams?.sampleExtraction);

    // Sample extraction always uses non-streaming (only 100 rows)
    if (isSampleExtraction) {
      const result = await this.getSampleDataExtraction(request, report, cachedReader);
      res.json(result);
      return;
    }

    // Check feature flag for full extraction
    if (this.isStreamingEnabled()) {
      this.logger.log('Using streaming mode for getData (LOOKER_STREAMING_ENABLED=true)');
      await this.getFullDataExtractionStreaming(request, report, cachedReader, res);
    } else {
      // Non-streaming mode (default)
      const result = await this.getFullDataExtraction(request, report, cachedReader);
      res.json(result);
    }
  }

  /**
   * Processes full data extraction with streaming response.
   */
  private async getFullDataExtractionStreaming(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData,
    res: Response
  ): Promise<void> {
    this.logger.log(`Starting streaming report run ${report.id}`);

    const reportRun = await this.lookerStudioReportRunService.create(report);
    if (!reportRun) {
      throw new InternalServerErrorException('Failed to create report run');
    }

    try {
      await this.projectBalanceService.verifyCanPerformOperations(report.dataMart.projectId);
      const context = await this.dataService.prepareStreamingContext(
        request,
        report,
        cachedReader,
        false
      );

      const { limitExceeded, limitReason, rowCount, bytesWritten } =
        await this.dataService.streamData(res, context);

      if (limitExceeded) {
        await this.handleFailedReportRun(
          reportRun,
          new BusinessViolationException(
            limitReason ??
              `Looker Studio streaming response truncated (unknown reason), rows sent: ${rowCount}, bytes sent: ${bytesWritten}`
          )
        );
      } else {
        await this.handleSuccessfulReportRun(reportRun);
      }
    } catch (e) {
      await this.handleFailedReportRun(reportRun, e);
      // If headers haven't been sent yet, throw to let error handler respond
      if (!res.headersSent) {
        throw e;
      }
      // If streaming already started, we can't send error response
      // Error is already logged in handleFailedReportRun
      this.logger.error('Error occurred after streaming started, response may be incomplete');
    }
  }

  /**
   * Retrieves and validates report with cached data reader.
   *
   * Steps:
   * 1. Validates request structure and authentication secret
   * 2. Fetches report by ID and secret key
   * 3. Gets or creates cached reader for the report
   *
   * @param request - getSchema or getData request with authentication
   * @returns Report entity and cached reader data
   * @throws BusinessViolationException if validation fails or report not found
   */
  private async getReportAndCachedReader(request: GetSchemaRequest | GetDataRequest): Promise<{
    report: Report;
    cachedReader: CachedReaderData;
  }> {
    // Validate and extract request data
    const { connectionConfig, requestConfig } = this.validateAndExtractRequestData(request);

    // Get report by ID and secret
    const report = await this.reportService.getByIdAndLookerStudioSecret(
      requestConfig.reportId,
      connectionConfig.destinationSecretKey
    );

    if (!report) {
      throw new BusinessViolationException('No report found for the provided secret and reportId');
    }

    // Get cached reader
    const cachedReader = await this.cacheService.getOrCreateCachedReader(report);

    return { report, cachedReader };
  }

  /**
   * Validates and extracts authentication and configuration from request.
   *
   * Validates:
   * - Connection config structure and secret key
   * - Request structure and config params
   * - Report ID format
   *
   * @param request - getSchema or getData request
   * @returns Validated connection config and report ID
   * @throws BusinessViolationException if validation fails
   */
  private validateAndExtractRequestData(
    request: GetSchemaRequest | GetDataRequest
  ): ValidatedRequestData {
    // Check connection config
    if (!request.connectionConfig) {
      throw new BusinessViolationException('Connection config not provided');
    }

    // Validate connection config
    const connectionConfigResult = ConnectionConfigSchema.safeParse(request.connectionConfig);
    if (!connectionConfigResult.success) {
      throw new BusinessViolationException('Incompatible connection config provided');
    }

    // Check request and configParams
    if (!request.request) {
      throw new BusinessViolationException('Request not provided');
    }

    const { configParams } = request.request;
    if (!configParams) {
      throw new BusinessViolationException('Request configParams not provided');
    }

    // Validate request config
    const requestConfigResult = ConnectorRequestConfigV1Schema.safeParse(configParams);
    if (!requestConfigResult.success) {
      throw new BusinessViolationException('Incompatible request config provided');
    }

    return {
      connectionConfig: connectionConfigResult.data,
      requestConfig: { reportId: requestConfigResult.data.reportId },
    };
  }

  /**
   * Processes sample data extraction request.
   * Returns up to 100 rows for preview without creating report run.
   *
   * @param request - getData request
   * @param report - Report entity
   * @param cachedReader - Cached data reader
   * @returns Sample data response (max 100 rows)
   */
  private async getSampleDataExtraction(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData
  ): Promise<GetDataResponse> {
    try {
      const { response } = await this.dataService.getData(request, report, cachedReader, true);
      return response;
    } catch (error) {
      this.logger.error('Failed to get sample data:', error);
      throw error;
    }
  }

  /**
   * Processes full data extraction request with run tracking.
   *
   * Creates LookerStudioReportRun, executes data extraction,
   * tracks consumption and publishes success event.
   *
   * @param request - getData request
   * @param report - Report entity
   * @param cachedReader - Cached data reader
   * @returns Full data response
   * @throws InternalServerErrorException if run creation fails
   */
  private async getFullDataExtraction(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData
  ): Promise<GetDataResponse> {
    this.logger.log(`Starting report run ${report.id}`);

    const reportRun = await this.lookerStudioReportRunService.create(report);
    if (!reportRun) {
      throw new InternalServerErrorException('Failed to create report run');
    }

    try {
      await this.projectBalanceService.verifyCanPerformOperations(report.dataMart.projectId);
      const { response, meta } = await this.dataService.getData(request, report, cachedReader);

      if (meta.limitExceeded) {
        await this.handleFailedReportRun(
          reportRun,
          new BusinessViolationException(
            meta.limitReason ??
              `Looker Studio response truncated (unknown reason), rows sent: ${meta.rowsSent}`
          )
        );
      } else {
        await this.handleSuccessfulReportRun(reportRun);
      }

      return response;
    } catch (e) {
      await this.handleFailedReportRun(reportRun, e);
      throw e;
    }
  }

  /**
   * Handles successful report run completion.
   *
   * Steps:
   * 1. Marks run as successful
   * 2. Persists run results in transaction
   * 3. Tracks consumption for billing
   * 4. Publishes LookerReportRunSuccessfullyEvent
   *
   * @param reportRun - Completed report run
   */
  private async handleSuccessfulReportRun(reportRun: LookerStudioReportRun) {
    reportRun.markAsSuccess();

    const saved = await this.saveReportRunResultSafely(reportRun);
    if (saved) {
      this.logger.log(`Report ${reportRun.getReportId()} completed successfully`);
    }

    const report = reportRun.getReport();
    await this.consumptionTrackingService.registerLookerReportRunConsumption(report);

    const {
      id: reportId,
      dataMart: { id: dataMartId, projectId },
      createdById: userId,
    } = report;

    await this.producer.produceEvent(
      new LookerReportRunSuccessfullyEvent(dataMartId, reportId, projectId, userId)
    );
  }

  /**
   * Handles failed report run.
   * Marks run as failed and attempts to persist the error state.
   *
   * @param reportRun - Failed report run
   * @param error - Error that caused the failure
   */
  private async handleFailedReportRun(reportRun: LookerStudioReportRun, error: Error | string) {
    reportRun.markAsUnsuccessful(error);
    await this.saveReportRunResultSafely(reportRun);
    if (error instanceof ProjectOperationBlockedException) {
      this.logger.warn(`Report ${reportRun.getReportId()} execution restricted: ${error.message}`);
    } else {
      this.logger.error(`Report ${reportRun.getReportId()} execution failed:`, error);
    }
  }

  /**
   * Attempts to save report run results to the database.
   * If save fails, logs the error but does not throw to prevent losing the in-memory state.
   *
   * TODO: Implement proper error handling strategy (retry mechanism, dead letter queue, etc.)
   *
   * @returns true if saved successfully, false otherwise
   */
  private async saveReportRunResultSafely(reportRun: LookerStudioReportRun): Promise<boolean> {
    try {
      await this.lookerStudioReportRunService.finish(reportRun);
      return true;
    } catch (saveError) {
      this.logger.error(
        `Failed to persist final status for report ${reportRun.getReportId()}:`,
        saveError
      );
    }
    return false;
  }
}
