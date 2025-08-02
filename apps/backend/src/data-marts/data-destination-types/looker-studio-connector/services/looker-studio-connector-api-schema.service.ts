import { Injectable, Logger } from '@nestjs/common';
import { DataStorageReportReader } from '../../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataMartService } from '../../../services/data-mart.service';
import { AggregationType } from '../enums/aggregation-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';
import { GetSchemaRequest, GetSchemaResponse, SchemaField } from '../schemas/get-schema.schema';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

interface CachedReaderData {
  reader: DataStorageReportReader;
  dataDescription: ReportDataDescription;
  fromCache: boolean;
}

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
    await this.dataMartService.save(report.dataMart);

    // Use headers from cached data description
    const reportDataHeaders = cachedReader.dataDescription.dataHeaders;
    const storageType = report.dataMart.storage.type;

    return {
      schema: this.getSchemaFields(reportDataHeaders, storageType),
    };
  }

  private getSchemaFields(
    reportDataHeaders: ReportDataHeader[],
    storageType: DataStorageType
  ): SchemaField[] {
    return reportDataHeaders.map(header => {
      const schemaField: SchemaField = {
        name: header.name,
        label: header.alias || header.name,
        description: header.description,
        dataType: this.typeMapperService.mapToLookerStudioDataType(
          header.storageFieldType!,
          storageType
        ),
      };
      if (schemaField.dataType === FieldDataType.NUMBER) {
        schemaField.semantics = {
          conceptType: FieldConceptType.METRIC,
          isReaggregatable: true,
        };
        schemaField.defaultAggregationType = AggregationType.SUM;
      } else {
        schemaField.semantics = {
          conceptType: FieldConceptType.DIMENSION,
        };
      }
      return schemaField;
    });
  }
}
