/**
 * Describes the structure and metadata of report data.
 * Contains information about headers and optionally the estimated number of data rows.
 */
export class ReportDataDescription {
  constructor(
    /**
     * Array of column headers for the report data.
     */
    public readonly dataHeaders: string[],
    /**
     * Optional estimated count of data rows.
     * Note: This value may not always be available in advance for all data sources.
     * Some data storage providers (like Athena) cannot reliably determine the row count
     * before retrieving the actual data.
     */
    public readonly estimatedDataRowsCount?: number
  ) {}
}
