import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageReportReader } from '../../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { Report } from '../../../entities/report.entity';
import { ReportService } from '../../../services/report.service';
import { ConnectionConfigSchema } from '../schemas/connection-config.schema';
import { ConnectorRequestConfigV1Schema } from '../schemas/connector-request-config.schema.v1';
import { GetConfigRequest, GetConfigResponse } from '../schemas/get-config.schema';
import { GetDataRequest, GetDataResponse } from '../schemas/get-data.schema';
import { GetSchemaRequest, GetSchemaResponse } from '../schemas/get-schema.schema';
import { LookerStudioConnectorApiConfigService } from './looker-studio-connector-api-config.service';
import { LookerStudioConnectorApiDataService } from './looker-studio-connector-api-data.service';
import { LookerStudioConnectorApiSchemaService } from './looker-studio-connector-api-schema.service';
import { ReportDataCacheService } from './report-data-cache.service';

interface CachedReaderData {
  reader: DataStorageReportReader;
  dataDescription: ReportDataDescription;
  fromCache: boolean;
}

interface ValidatedRequestData {
  connectionConfig: { destinationSecretKey: string };
  requestConfig: { reportId: string };
}

@Injectable()
export class LookerStudioConnectorApiService {
  constructor(
    private readonly configService: LookerStudioConnectorApiConfigService,
    private readonly schemaService: LookerStudioConnectorApiSchemaService,
    private readonly dataService: LookerStudioConnectorApiDataService,
    private readonly cacheService: ReportDataCacheService,
    private readonly reportService: ReportService
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
    
    // Pass cached data to data service
    return this.dataService.getData(request, report, cachedReader);
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
  private validateAndExtractRequestData(request: GetSchemaRequest | GetDataRequest): ValidatedRequestData {
    // Validate connection config
    const connectionConfigResult = ConnectionConfigSchema.safeParse(request.connectionConfig);
    if (!connectionConfigResult.success) {
      throw new BusinessViolationException('Incompatible connection config provided');
    }

    // Validate request config
    const requestConfigResult = ConnectorRequestConfigV1Schema.safeParse(request.request.configParams);
    if (!requestConfigResult.success) {
      throw new BusinessViolationException('Incompatible request config provided');
    }

    const requestConfig = requestConfigResult.data;
    if (!requestConfig.reportId) {
      throw new BusinessViolationException('ReportId is required');
    }

    return {
      connectionConfig: connectionConfigResult.data,
      requestConfig: { reportId: requestConfig.reportId }
    };
  }
}
