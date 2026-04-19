import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { Report } from '../../entities/report.entity';
import { ReportDataDescription } from '../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../dto/domain/report-data-batch.dto';
import { DataStorageReportReaderState } from './data-storage-report-reader-state.interface';

/**
 * Optional runtime hints for report data preparation.
 *
 * Both fields are derived from `report.columnConfig` via `BlendedReportDataService`.
 * Readers should:
 * - execute `sqlOverride` instead of the definition-derived query when it is set
 *   (used to run pre-built blended SQL);
 * - pass `columnFilter` to the underlying `DataMartQueryBuilder` and restrict
 *   `reportDataHeaders` to exactly this list (preserving the user-chosen order).
 *
 * When both are undefined the reader behaves as before — every non-hidden
 * column is surfaced with `SELECT *`.
 */
export interface PrepareReportDataOptions {
  sqlOverride?: string;
  columnFilter?: string[];
  /**
   * Precomputed headers for columns that originate from blended schema
   * (not native). Readers merge these with native headers produced by
   * their own headers generator, keeping the `columnFilter` order.
   *
   * This lets readers stay oblivious to blended-field metadata while still
   * producing a correct ordered header list for destinations.
   */
  blendedDataHeaders?: ReportDataHeader[];
}

/**
 * Interface for reading report data from a data storage
 */
export interface DataStorageReportReader extends TypedComponent<DataStorageType> {
  /**
   * Prepares report data for reading
   */
  prepareReportData(
    report: Report,
    options?: PrepareReportDataOptions
  ): Promise<ReportDataDescription>;

  /**
   * Reads a batch of report data
   */
  readReportDataBatch(batchId?: string, maxDataRows?: number): Promise<ReportDataBatch>;

  /**
   * Finalizes the report reading process
   */
  finalize(): Promise<void>;

  /**
   * Gets current reader state for caching
   */
  getState(): DataStorageReportReaderState | null;

  /**
   * Initializes reader from cached state
   */
  initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void>;
}
