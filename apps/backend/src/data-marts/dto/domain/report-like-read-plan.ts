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
