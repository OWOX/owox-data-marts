import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { ReportDataHeader } from '../../dto/domain/report-data-header.dto';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { ReportLike } from '../../dto/domain/report-like-read-plan';
import { ReportDataDescription } from '../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../dto/domain/report-data-batch.dto';
import { DataStorageReportReaderState } from './data-storage-report-reader-state.interface';
import { CalculatedFieldPlan, SqlParameter } from '../utils/sql-clause-renderer';
import { AggregationRule } from '../../dto/schemas/aggregation-config.schema';
import { JoinedUniqueCountHeaderSource } from './blended-query-builder.interface';

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
  /** Named parameters to bind when executing `sqlOverride`. */
  sqlOverrideParams?: SqlParameter[];
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

  /**
   * Aggregation rules from the report. `resolveReportDataHeaders` uses these to rename
   * each aggregated column's header to its suffixed output label and recompute its
   * effective type — keeping the header name equal to the SQL output alias.
   */
  aggregationConfig?: AggregationRule[];

  /**
   * When true, a synthetic `Unique Count` header is appended after the aggregated columns.
   * Set by callers that pass `uniqueCount: true` to the query builder.
   */
  uniqueCount?: boolean;

  /**
   * The main Data Mart's CURRENT primary key. The `Unique Count` column is emitted only when the
   * key is non-empty, so the header is gated on the very same predicate — a key removed after the
   * report was saved must take the header with it, not leave one with no data behind it.
   * Callers passing `uniqueCount: true` MUST pass this too.
   */
  primaryKeyColumns?: string[];

  /**
   * Joined sources that carry their own `<prefix> Unique Count` column, already reduced to the
   * ones that survived chain/key resolution. One header per entry, from the SAME list the SQL
   * builder rendered its sleeves from.
   */
  uniqueCountSources?: JoinedUniqueCountHeaderSource[];

  /**
   * Server-side per-query timeout (ms). BigQuery/Snowflake abort the job/statement at the
   * warehouse when exceeded, capping cost. Other storages currently ignore it.
   */
  queryTimeoutMs?: number;

  /**
   * When it fires (client disconnect/cancel), BigQuery/Snowflake cancel the in-flight warehouse
   * job/statement so an abandoned query stops billing compute immediately. Other storages ignore it.
   */
  signal?: AbortSignal;

  /**
   * Calculated fields selected in this report (main-owner only). Each carries no
   * warehouse column to derive a type from, so `resolveReportDataHeaders` synthesizes its header
   * from the analyst's declared `type` — the same precedent as Unique Count and the aggregation
   * aliases.
   */
  calculatedFields?: readonly CalculatedFieldPlan[];
}

/**
 * Interface for reading report data from a data storage
 */
export interface DataStorageReportReader extends TypedComponent<DataStorageType> {
  /**
   * Whether this reader enforces `PrepareReportDataOptions.queryTimeoutMs` at the warehouse. Readers
   * that leave it unset silently drop the cap — callers relying on a cost bound should observe that.
   */
  readonly honorsQueryTimeout?: boolean;

  /**
   * Prepares report data for reading
   */
  prepareReportData(
    report: ReportLike,
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
