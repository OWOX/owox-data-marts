import { Injectable } from '@nestjs/common';
import { AthenaFieldType } from '../../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { SnowflakeFieldType } from '../../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { RedshiftFieldType } from '../../../data-storage-types/redshift/enums/redshift-field-type.enum';
import { DatabricksFieldType } from '../../../data-storage-types/databricks/enums/databricks-field-type.enum';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { FieldDataType } from '../enums/field-data-type.enum';

@Injectable()
export class LookerStudioTypeMapperService {
  /**
   * Maps data types from storage types to Looker Studio types
   */
  mapToLookerStudioDataType(
    fieldType:
      | BigQueryFieldType
      | AthenaFieldType
      | SnowflakeFieldType
      | RedshiftFieldType
      | DatabricksFieldType,
    storageType: DataStorageType
  ): FieldDataType {
    if (storageType === DataStorageType.GOOGLE_BIGQUERY) {
      return this.mapBigQueryTypeToLookerStudio(fieldType as BigQueryFieldType);
    } else if (storageType === DataStorageType.AWS_ATHENA) {
      return this.mapAthenaTypeToLookerStudio(fieldType as AthenaFieldType);
    } else if (storageType === DataStorageType.SNOWFLAKE) {
      return this.mapSnowflakeTypeToLookerStudio(fieldType as SnowflakeFieldType);
    } else if (storageType === DataStorageType.AWS_REDSHIFT) {
      return this.mapRedshiftTypeToLookerStudio(fieldType as RedshiftFieldType);
    } else if (storageType === DataStorageType.DATABRICKS) {
      return this.mapDatabricksTypeToLookerStudio(fieldType as DatabricksFieldType);
    }
    // Fallback for unknown storage types
    return FieldDataType.STRING;
  }

  /**
   * Maps BigQuery types to Looker Studio types
   */
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

  /**
   * Maps Athena types to Looker Studio types
   */
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

  /**
   * Maps Snowflake types to Looker Studio types
   */
  private mapSnowflakeTypeToLookerStudio(type: SnowflakeFieldType): FieldDataType {
    switch (type) {
      case SnowflakeFieldType.NUMERIC:
      case SnowflakeFieldType.INTEGER:
      case SnowflakeFieldType.FLOAT:
        return FieldDataType.NUMBER;
      case SnowflakeFieldType.BOOLEAN:
        return FieldDataType.BOOLEAN;
      case SnowflakeFieldType.STRING:
      case SnowflakeFieldType.BYTES:
      case SnowflakeFieldType.DATE:
      case SnowflakeFieldType.TIME:
      case SnowflakeFieldType.TIMESTAMP:
      case SnowflakeFieldType.VARIANT:
      case SnowflakeFieldType.GEOGRAPHY:
      default:
        return FieldDataType.STRING;
    }
  }

  /**
   * Maps Redshift types to Looker Studio types
   */
  private mapRedshiftTypeToLookerStudio(type: RedshiftFieldType): FieldDataType {
    switch (type) {
      case RedshiftFieldType.SMALLINT:
      case RedshiftFieldType.INTEGER:
      case RedshiftFieldType.BIGINT:
      case RedshiftFieldType.DECIMAL:
      case RedshiftFieldType.NUMERIC:
      case RedshiftFieldType.REAL:
      case RedshiftFieldType.DOUBLE_PRECISION:
        return FieldDataType.NUMBER;
      case RedshiftFieldType.BOOLEAN:
      case RedshiftFieldType.BOOL:
        return FieldDataType.BOOLEAN;
      case RedshiftFieldType.VARCHAR:
      case RedshiftFieldType.CHAR:
      case RedshiftFieldType.TEXT:
      case RedshiftFieldType.BPCHAR:
      case RedshiftFieldType.DATE:
      case RedshiftFieldType.TIMESTAMP:
      case RedshiftFieldType.TIMESTAMPTZ:
      case RedshiftFieldType.TIME:
      case RedshiftFieldType.TIMETZ:
      case RedshiftFieldType.SUPER:
      case RedshiftFieldType.GEOMETRY:
      case RedshiftFieldType.GEOGRAPHY:
      default:
        return FieldDataType.STRING;
    }
  }

  /**
   * Maps Databricks types to Looker Studio types
   */
  private mapDatabricksTypeToLookerStudio(type: DatabricksFieldType): FieldDataType {
    switch (type) {
      case DatabricksFieldType.TINYINT:
      case DatabricksFieldType.SMALLINT:
      case DatabricksFieldType.INT:
      case DatabricksFieldType.BIGINT:
      case DatabricksFieldType.FLOAT:
      case DatabricksFieldType.DOUBLE:
      case DatabricksFieldType.DECIMAL:
        return FieldDataType.NUMBER;
      case DatabricksFieldType.BOOLEAN:
        return FieldDataType.BOOLEAN;
      case DatabricksFieldType.STRING:
      case DatabricksFieldType.VARCHAR:
      case DatabricksFieldType.CHAR:
      case DatabricksFieldType.BINARY:
      case DatabricksFieldType.DATE:
      case DatabricksFieldType.TIMESTAMP:
      case DatabricksFieldType.TIMESTAMP_NTZ:
      case DatabricksFieldType.INTERVAL:
      case DatabricksFieldType.ARRAY:
      case DatabricksFieldType.MAP:
      case DatabricksFieldType.STRUCT:
      default:
        return FieldDataType.STRING;
    }
  }
}
