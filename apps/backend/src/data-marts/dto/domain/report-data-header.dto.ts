import { BigQueryFieldType } from '../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../../data-storage-types/athena/enums/athena-field-type.enum';

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
     * The storage field type (BigQuery or Athena)
     */
    public readonly storageFieldType?: BigQueryFieldType | AthenaFieldType
  ) {}
}
