import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataMartSchema } from '../../../data-storage-types/data-mart-schema.type';
import { ReportService } from '../../../services/report.service';
import { ConnectionConfigSchema } from "../schemas/connection-config.schema";
import {
  ConnectorRequestConfigV1,
  ConnectorRequestConfigV1Schema,
} from '../schemas/connector-request-config.schema.v1';
import { GetDataRequest, GetDataResponse } from '../schemas/get-data.schema';
import { GetSchemaRequest, GetSchemaResponse, SchemaField } from '../schemas/get-schema.schema';
import { AggregationType } from '../enums/aggregation-type.enum';
import { FieldConceptType } from '../enums/field-concept-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../../../data-storage-types/athena/enums/athena-field-type.enum';

@Injectable()
export class LookerStudioConnectorApiDataService {
  private readonly logger = new Logger(LookerStudioConnectorApiDataService.name);

  constructor(private readonly reportsService: ReportService) {}

  public async getData(request: GetDataRequest): Promise<GetDataResponse> {
    this.logger.log('getData called with request:', request);

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

    const dataMartSchema = report.dataMart.schema;
    if (!dataMartSchema) {
      throw new BusinessViolationException('No schema found for the selected data mart');
    }

    return {
      schema: [],
      rows: [],
      filtersApplied: [],
    };
  }

  private getSchemaFields(dataMartSchema: DataMartSchema): SchemaField[] {
    return dataMartSchema.fields.map(field => {
      const schemaField: SchemaField = {
        name: field.name,
        label: field.alias || field.name,
        description: field.description,
        dataType: this.mapToLookerStudioDataType(field.type, dataMartSchema.type),
        semantics: {
          conceptType: this.determineConceptType(field),
          isReaggregatable: this.isNumericType(field.type, dataMartSchema.type),
        },
      };

      // Добавляем агрегацию по умолчанию для числовых полей
      if (this.isNumericType(field.type, dataMartSchema.type)) {
        schemaField.defaultAggregationType = AggregationType.SUM;
      }

      return schemaField;
    });
  }

  private mapToLookerStudioDataType(
    fieldType: BigQueryFieldType | AthenaFieldType,
    schemaType: string
  ): FieldDataType {
    if (schemaType === 'bigquery-data-mart-schema') {
      return this.mapBigQueryTypeToLookerStudio(fieldType as BigQueryFieldType);
    } else if (schemaType === 'athena-data-mart-schema') {
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

  private determineConceptType(field: any): FieldConceptType {
    // Если поле является первичным ключом, то это измерение
    if (field.isPrimaryKey) {
      return FieldConceptType.DIMENSION;
    }

    // Логика определения типа концепции на основе имени поля
    const fieldName = field.name.toLowerCase();

    // Если имя поля содержит ключевые слова метрик
    if (
      fieldName.includes('count') ||
      fieldName.includes('sum') ||
      fieldName.includes('total') ||
      fieldName.includes('amount') ||
      fieldName.includes('value') ||
      fieldName.includes('revenue') ||
      fieldName.includes('cost')
    ) {
      return FieldConceptType.METRIC;
    }

    // По умолчанию считаем измерением
    return FieldConceptType.DIMENSION;
  }

  private isNumericType(
    fieldType: BigQueryFieldType | AthenaFieldType,
    schemaType: string
  ): boolean {
    if (schemaType === 'bigquery-data-mart-schema') {
      const bigQueryType = fieldType as BigQueryFieldType;
      return [
        BigQueryFieldType.INTEGER,
        BigQueryFieldType.FLOAT,
        BigQueryFieldType.NUMERIC,
        BigQueryFieldType.BIGNUMERIC,
      ].includes(bigQueryType);
    } else if (schemaType === 'athena-data-mart-schema') {
      const athenaType = fieldType as AthenaFieldType;
      return [
        AthenaFieldType.TINYINT,
        AthenaFieldType.SMALLINT,
        AthenaFieldType.INTEGER,
        AthenaFieldType.BIGINT,
        AthenaFieldType.FLOAT,
        AthenaFieldType.REAL,
        AthenaFieldType.DOUBLE,
        AthenaFieldType.DECIMAL,
      ].includes(athenaType);
    }

    return false;
  }
}
