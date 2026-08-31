import { ReportDataHeader } from './report-data-header.dto';
import {
  CalculatedFieldPlan,
  SqlParameter,
} from '../../data-storage-types/utils/sql-clause-renderer';
import {
  JoinedUniqueCountSource,
  ResolvedRelationshipChain,
} from '../../data-storage-types/interfaces/blended-query-builder.interface';
import { AggregationRule } from '../schemas/aggregation-config.schema';

export interface BlendingDecision {
  needsBlending: boolean;
  blendedSql?: string;
  /** Named parameters to bind alongside `blendedSql` when running the query. */
  params?: SqlParameter[];
  columnFilter?: string[];
  // Non-empty iff columnFilter is set; one entry per blended (non-native) column.
  blendedDataHeaders?: ReportDataHeader[];
  /** Resolved relationship chains used to build the blended query. Present when needsBlending=true. */
  chains?: ResolvedRelationshipChain[];
  /**
   * The report's aggregations after a joined COUNT beside a COUNT_DISTINCT was dropped. Set only
   * when that changed something; readers must use it for headers or they emit a column the SQL
   * no longer has.
   */
  aggregations?: AggregationRule[];
  /**
   * The main Data Mart's CURRENT primary key, on every decision (blended or not). Readers gate the
   * `Unique Count` header on it so the header and the SQL column disappear together.
   */
  primaryKeyColumns?: string[];
  /**
   * Joined sources whose per-source `Unique Count` the blended SQL actually renders — sources that
   * lost their chain or key are already gone. Readers build their headers from this exact list.
   */
  uniqueCountSources?: JoinedUniqueCountSource[];
  /**
   * The report's selected calculated fields, as plans.
   *
   * On the BLENDED path these are what the SQL projects through its own formula-substitution
   * channel, and their names are already stripped out of `columnFilter` — a reader must forward
   * BOTH, or the metric is emitted by the SQL with no header naming it.
   *
   * On the NON-blended path no SQL is produced here, so the plans are carried purely so a caller
   * that only needs to NAME the columns does not have to rebuild them (or compose SQL to get at
   * them). `columnFilter` is the raw column config there and still holds the metric names, so such
   * a caller strips them itself. A caller that goes on to execute must keep taking its plans from
   * `compose()`, which is the one that renders them.
   */
  calculatedFields?: CalculatedFieldPlan[];
}
