import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import {
  ReportGeneratedSqlAction,
  ReportOpenDocumentAction,
  ReportTitleCell,
  reportTitleCellQuickActionClassName,
} from '../../../shared/components';

interface GoogleSheetsReportTitleCellProps {
  report: DataMartReport;
}

export function GoogleSheetsReportTitleCell({ report }: GoogleSheetsReportTitleCellProps) {
  return (
    <ReportTitleCell
      title={report.title}
      actions={
        <>
          <ReportOpenDocumentAction
            report={report}
            className={reportTitleCellQuickActionClassName}
          />
          <ReportGeneratedSqlAction
            report={report}
            className={reportTitleCellQuickActionClassName}
          />
        </>
      }
    />
  );
}
