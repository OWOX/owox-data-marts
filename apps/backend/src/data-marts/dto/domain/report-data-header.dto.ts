import { ReportAggregateFunction } from '../schemas/aggregate-function.schema';
import { StorageFieldType } from './storage-field-type';

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
    public readonly storageFieldType?: StorageFieldType,

    /**
     * The aggregate function applied to the field (if any)
     */
    public readonly aggregateFunction?: ReportAggregateFunction
  ) {}
}
