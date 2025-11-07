import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { Report } from '../../../entities/report.entity';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import { ReportService } from '../../../services/report.service';
import { ConnectionConfigSchema } from '../schemas/connection-config.schema';
import { ConnectorRequestConfigV1Schema } from '../schemas/connector-request-config.schema.v1';
import { GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';
import { GetDataRequest, GetDataResponse } from '../schemas/get-data.schema';
import { GetSchemaRequest, GetSchemaResponse } from '../schemas/get-schema.schema';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { ReportDataCacheService } from '../../../services/report-data-cache.service';
import { OWOX_PRODUCER } from '../../../../common/producer/producer.module';
import { OwoxProducer } from '@owox/internal-helpers';
import { LookerReportRunSuccessfullyEvent } from '../../../events/looker-report-run-successfully.event';
import { LookerStudioReportRunService } from '../../../services/looker-studio-report-run.service';
import { LookerStudioReportRun } from '../../../models/looker-studio-report-run.model';

interface ValidatedRequestData {
  connectionConfig: { destinationSecretKey: string };
  requestConfig: { reportId: string };
}

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
    private readonly lookerStudioReportRunService: LookerStudioReportRunService
  ) {}

  public async getConfig(request: GetConfigRequest): Promise<GetConfigResponse> {
    return this.configService.getConfig(request);
  }

  public async getSchema(request: GetSchemaRequest): Promise<GetSchemaResponse> {
    // Get report and cached reader centrally
    const { report, cachedReader } = await this.getReportAndCachedReader(request);

    // Pass cached data to schema service
    return this.schemaService.getSchema(request, report, cachedReader);
  }

  public async getData(request: GetDataRequest): Promise<GetDataResponse> {
    // Get report and cached reader centrally
    const { report, cachedReader } = await this.getReportAndCachedReader(request);
    const isSampleExtraction = Boolean(request.request.scriptParams?.sampleExtraction);

    return isSampleExtraction
      ? await this.getSampleDataExtraction(request, report, cachedReader)
      : await this.getFullDataExtraction(request, report, cachedReader);
  }

  /**
   * Common method to get report and cached reader for both schema and data requests
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
   * Validates and extracts common request data
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

  private async getSampleDataExtraction(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData
  ): Promise<GetDataResponse> {
    try {
      return await this.dataService.getData(request, report, cachedReader, true);
    } catch (error) {
      this.logger.error('Failed to get sample data:', error);
      throw error;
    }
  }

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
      const result = await this.dataService.getData(request, report, cachedReader);
      await this.handleSuccessfulReportRun(reportRun);

      return result;
    } catch (e) {
      await this.handleFailedReportRun(reportRun, e);
      throw e;
    }
  }

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

  private async handleFailedReportRun(reportRun: LookerStudioReportRun, error: Error | string) {
    reportRun.markAsFailed(error);
    await this.saveReportRunResultSafely(reportRun);
    this.logger.error(`Report ${reportRun.getReportId()} execution failed:`, error);
  }

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
