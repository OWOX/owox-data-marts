import { BigQueryFieldType } from '../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../../data-storage-types/athena/enums/athena-field-type.enum';
import { SnowflakeFieldType } from '../../data-storage-types/snowflake/enums/snowflake-field-type.enum';
import { RedshiftFieldType } from '../../data-storage-types/redshift/enums/redshift-field-type.enum';
import { DatabricksFieldType } from '../../data-storage-types/databricks/enums/databricks-field-type.enum';

/**
 * Represents a single report data header with metadata
 */
export class ReportDataHeader {
  constructor(
    /**
     * The name of the header
     */
    public readonly name: string,

    /**
     * Optional alias for the header
     */
    public readonly alias?: string,

    /**
     * Optional description of the header
     */
    public readonly description?: string,

    /**
     * The storage field type
     */
    public readonly storageFieldType?:
      | BigQueryFieldType
      | AthenaFieldType
      | SnowflakeFieldType
      | RedshiftFieldType
      | DatabricksFieldType
  ) {}
}
