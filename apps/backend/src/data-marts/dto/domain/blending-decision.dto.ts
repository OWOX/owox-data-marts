import { ReportDataHeader } from './report-data-header.dto';
import { SqlParameter } from '../../data-storage-types/utils/sql-clause-renderer';
import { ResolvedRelationshipChain } from '../../data-storage-types/interfaces/blended-query-builder.interface';
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
}
