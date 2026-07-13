import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import {
  ReportGeneratedSqlAction,
  ReportTitleCell,
  reportTitleCellQuickActionClassName,
} from '../../../shared/components';

interface EmailReportTitleCellProps {
  report: DataMartReport;
}

export function EmailReportTitleCell({ report }: EmailReportTitleCellProps) {
  return (
    <ReportTitleCell
      title={report.title}
      actions={
        <ReportGeneratedSqlAction report={report} className={reportTitleCellQuickActionClassName} />
      }
    />
  );
}
