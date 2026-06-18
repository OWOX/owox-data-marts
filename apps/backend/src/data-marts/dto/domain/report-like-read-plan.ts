import { DataMart } from '../../entities/data-mart.entity';
import { Report } from '../../entities/report.entity';
import { ReportColumnConfig } from '../schemas/report-column-config.schema';
import { FilterConfig } from '../schemas/filter-config.schema';
import { SortConfig } from '../schemas/sort-config.schema';

// Must stay structurally compatible with the subset of `Report` fields read by
// `BlendedReportDataService.resolveBlendingDecision` and `DataStorageReportReader.prepareReportData`.
export interface ReportLikeReadPlan {
  dataMart: DataMart;
  columnConfig?: ReportColumnConfig;
  filterConfig?: FilterConfig;
  sortConfig?: SortConfig;
  limitConfig?: number | null;
}

export type ReportLike = Report | ReportLikeReadPlan;

/**
 * True when the report carries any output control — a filter, sort, or limit.
 * Single source for this predicate (run / cache / compose / run-record paths) so the
 * copies cannot drift.
 */
export function hasOutputControls(report: ReportLike): boolean {
  return (
    (report.filterConfig?.length ?? 0) > 0 ||
    (report.sortConfig?.length ?? 0) > 0 ||
    report.limitConfig != null
  );
}
