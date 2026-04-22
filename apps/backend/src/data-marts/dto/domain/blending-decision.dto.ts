import { ReportDataHeader } from './report-data-header.dto';

export interface BlendingDecision {
  needsBlending: boolean;
  blendedSql?: string;
  columnFilter?: string[];
  // Non-empty iff columnFilter is set; one entry per blended (non-native) column.
  blendedDataHeaders?: ReportDataHeader[];
}
