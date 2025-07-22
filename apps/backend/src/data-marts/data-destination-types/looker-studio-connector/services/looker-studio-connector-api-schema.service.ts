import { Injectable, Logger } from '@nestjs/common';
import { ReportHeadersGeneratorFacade } from 'src/data-marts/data-storage-types/facades/report-headers-generator.facade';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { AthenaFieldType } from '../../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { DataMartService } from '../../../services/data-mart.service';
import { ReportService } from '../../../services/report.service';
import { FieldDataType } from '../enums/field-data-type.enum';
import { ConnectionConfigSchema } from '../schemas/connection-config.schema';
import {
  ConnectorRequestConfigV1,
  ConnectorRequestConfigV1Schema,
} from '../schemas/connector-request-config.schema.v1';
import { GetSchemaRequest, GetSchemaResponse, SchemaField } from '../schemas/get-schema.schema';

@Injectable()
export class LookerStudioConnectorApiSchemaService {
  private readonly logger = new Logger(LookerStudioConnectorApiSchemaService.name);

  constructor(
    private readonly reportsService: ReportService,
    private readonly dataMartService: DataMartService,
    private readonly reportHeadersGeneratorFacade: ReportHeadersGeneratorFacade
  ) {}

  public async getSchema(request: GetSchemaRequest): Promise<GetSchemaResponse> {
    this.logger.log('getSchema called with request:', request);

    const connectionConfigOpt = ConnectionConfigSchema.safeParse(request.connectionConfig);
    if (!connectionConfigOpt.success) {
      this.logger.error('Incompatible request config', connectionConfigOpt.error);
      throw new BusinessViolationException('Incompatible connection config provided');
    }

    const requestConfigOpt = ConnectorRequestConfigV1Schema.safeParse(request.request.configParams);
    if (!requestConfigOpt.success) {
      this.logger.error('Incompatible request config', requestConfigOpt.error);
      throw new BusinessViolationException('Incompatible request config provided');
    }

    const requestConfig: ConnectorRequestConfigV1 = requestConfigOpt.data;
    if (!requestConfig.reportId) {
      throw new BusinessViolationException('ReportId are required to get schema');
    }

    const report = await this.reportsService.getByIdAndLookerStudioSecret(
      requestConfig.reportId,
      connectionConfigOpt.data.destinationSecret
    );

    if (!report) {
      throw new BusinessViolationException('No report found for the provided secret and reportId');
    }

    // actualizing data mart schema
    await this.dataMartService.actualizeSchemaInEntity(report.dataMart);
    await this.dataMartService.save(report.dataMart);

    const dataMartSchema = report.dataMart.schema;
    if (!dataMartSchema) {
      throw new BusinessViolationException('No schema found for the selected data mart');
    }

    const dataMartStorageType = report.dataMart.storage.type;
    const reportDataHeaders: ReportDataHeader[] =
      await this.reportHeadersGeneratorFacade.generateHeadersFromSchema(
        dataMartStorageType,
        dataMartSchema
      );

    return {
      schema: this.getSchemaFields(reportDataHeaders, dataMartStorageType),
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
        dataType: this.mapToLookerStudioDataType(header.storageFieldType!, storageType),
      };
      return schemaField;
    });
  }

  private mapToLookerStudioDataType(
    fieldType: BigQueryFieldType | AthenaFieldType,
    storageType: DataStorageType
  ): FieldDataType {
    if (storageType === DataStorageType.GOOGLE_BIGQUERY) {
      return this.mapBigQueryTypeToLookerStudio(fieldType as BigQueryFieldType);
    } else if (storageType === DataStorageType.AWS_ATHENA) {
      return this.mapAthenaTypeToLookerStudio(fieldType as AthenaFieldType);
    }
    // Fallback
    return FieldDataType.STRING;
  }

  private mapBigQueryTypeToLookerStudio(type: BigQueryFieldType): FieldDataType {
    switch (type) {
      case BigQueryFieldType.INTEGER:
      case BigQueryFieldType.FLOAT:
      case BigQueryFieldType.NUMERIC:
      case BigQueryFieldType.BIGNUMERIC:
        return FieldDataType.NUMBER;
      case BigQueryFieldType.BOOLEAN:
        return FieldDataType.BOOLEAN;
      case BigQueryFieldType.STRING:
      case BigQueryFieldType.DATE:
      case BigQueryFieldType.TIME:
      case BigQueryFieldType.DATETIME:
      case BigQueryFieldType.TIMESTAMP:
      case BigQueryFieldType.BYTES:
      case BigQueryFieldType.GEOGRAPHY:
      case BigQueryFieldType.JSON:
      case BigQueryFieldType.RECORD:
      case BigQueryFieldType.STRUCT:
      case BigQueryFieldType.RANGE:
      case BigQueryFieldType.INTERVAL:
      default:
        return FieldDataType.STRING;
    }
  }

  private mapAthenaTypeToLookerStudio(type: AthenaFieldType): FieldDataType {
    switch (type) {
      case AthenaFieldType.TINYINT:
      case AthenaFieldType.SMALLINT:
      case AthenaFieldType.INTEGER:
      case AthenaFieldType.BIGINT:
      case AthenaFieldType.FLOAT:
      case AthenaFieldType.REAL:
      case AthenaFieldType.DOUBLE:
      case AthenaFieldType.DECIMAL:
        return FieldDataType.NUMBER;
      case AthenaFieldType.BOOLEAN:
        return FieldDataType.BOOLEAN;
      case AthenaFieldType.CHAR:
      case AthenaFieldType.VARCHAR:
      case AthenaFieldType.STRING:
      case AthenaFieldType.BINARY:
      case AthenaFieldType.VARBINARY:
      case AthenaFieldType.DATE:
      case AthenaFieldType.TIME:
      case AthenaFieldType.TIMESTAMP:
      case AthenaFieldType.TIME_WITH_TIME_ZONE:
      case AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE:
      case AthenaFieldType.INTERVAL_YEAR_TO_MONTH:
      case AthenaFieldType.INTERVAL_DAY_TO_SECOND:
      case AthenaFieldType.ARRAY:
      case AthenaFieldType.MAP:
      case AthenaFieldType.STRUCT:
      case AthenaFieldType.ROW:
      case AthenaFieldType.JSON:
      default:
        return FieldDataType.STRING;
    }
  }
}
