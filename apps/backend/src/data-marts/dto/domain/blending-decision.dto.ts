import { ReportDataHeader } from './report-data-header.dto';
import { SqlParameter } from '../../data-storage-types/utils/sql-clause-renderer';

export interface BlendingDecision {
  needsBlending: boolean;
  blendedSql?: string;
  /** Named parameters to bind alongside `blendedSql` when running the query. */
  params?: SqlParameter[];
  columnFilter?: string[];
  // Non-empty iff columnFilter is set; one entry per blended (non-native) column.
  blendedDataHeaders?: ReportDataHeader[];
}
