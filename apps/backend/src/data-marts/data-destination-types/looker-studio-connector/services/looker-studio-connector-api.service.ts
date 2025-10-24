import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { Report } from '../../../entities/report.entity';
import { ReportRunStatus } from '../../../enums/report-run-status.enum';
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
    private readonly producer: OwoxProducer
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
    let error: Error | null = null;
    const isSampleExtraction = Boolean(request.request.scriptParams?.sampleExtraction);
    try {
      return await this.dataService.getData(request, report, cachedReader, isSampleExtraction);
    } catch (e) {
      this.logger.error('Failed to get data:', e);
      error = e;
      throw e;
    } finally {
      if (!isSampleExtraction) {
        if (error) {
          await this.reportService.updateRunStatus(report.id, ReportRunStatus.ERROR, error.message);
        } else {
          await this.reportService.updateRunStatus(report.id, ReportRunStatus.SUCCESS);
          await this.consumptionTrackingService.registerLookerReportRunConsumption(report);
          const dataMart = report.dataMart;
          await this.producer.produceEvent(
            new LookerReportRunSuccessfullyEvent(
              dataMart.id,
              report.id,
              dataMart.projectId,
              report.createdById
            )
          );
        }
      }
    }
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
    // Validate connection config
    const connectionConfigResult = ConnectionConfigSchema.safeParse(request.connectionConfig);
    if (!connectionConfigResult.success) {
      throw new BusinessViolationException('Incompatible connection config provided');
    }

    // Check request config
    const requestConfigParams = request.request?.configParams;
    if (!requestConfigParams) {
      throw new BusinessViolationException('Request config not provided');
    }

    // Validate request config
    const requestConfigResult = ConnectorRequestConfigV1Schema.safeParse(requestConfigParams);
    if (!requestConfigResult.success) {
      throw new BusinessViolationException('Incompatible request config provided');
    }

    return {
      connectionConfig: connectionConfigResult.data,
      requestConfig: { reportId: requestConfigResult.data.reportId },
    };
  }
}
