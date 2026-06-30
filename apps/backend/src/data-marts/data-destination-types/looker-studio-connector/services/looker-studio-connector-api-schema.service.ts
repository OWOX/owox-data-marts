import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataMartService } from '../../../services/data-mart.service';
import { GetSchemaRequest, GetSchemaResponse, SchemaField } from '../schemas/get-schema.schema';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

@Injectable()
export class LookerStudioConnectorApiSchemaService {
  private readonly logger = new Logger(LookerStudioConnectorApiSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly typeMapperService: LookerStudioTypeMapperService
  ) {}

  public async getSchema(
    request: GetSchemaRequest,
    report: Report,
    cachedReader: CachedReaderData
  ): Promise<GetSchemaResponse> {
    this.logger.log('getSchema called with request:', request);
    this.logger.debug(`Using ${cachedReader.fromCache ? 'cached' : 'fresh'} reader for schema`);

    // Actualize data mart schema
    await this.dataMartService.actualizeSchemaInEntity(report.dataMart);
    await this.dataMartService.saveActualizedSchema(report.dataMart);

    // Use headers from cached data description
    const reportDataHeaders = cachedReader.dataDescription.dataHeaders;
    const storageType = report.dataMart.storage.type;

    return {
      schema: this.getSchemaFields(reportDataHeaders, storageType),
    };
  }

  getSchemaFields(
    reportDataHeaders: ReportDataHeader[],
    storageType: DataStorageType
  ): SchemaField[] {
    return reportDataHeaders.map(header =>
      this.typeMapperService.buildSchemaField(header, storageType)
    );
  }
}
