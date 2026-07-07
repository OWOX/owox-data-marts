import { GeneratedSqlViewer } from '../../../edit/components/ReportColumnPicker/GeneratedSqlViewer';
import { isGeneratedSqlSupported } from '../utils';
import type { DataMartReport } from '../model/types/data-mart-report';

interface ReportGeneratedSqlActionProps {
  report: DataMartReport;
  className?: string;
}

export function ReportGeneratedSqlAction({ report, className }: ReportGeneratedSqlActionProps) {
  if (!isGeneratedSqlSupported(report.dataMart.definitionType, report.dataMart.storage.type)) {
    return null;
  }

  return (
    <GeneratedSqlViewer
      reportId={report.id}
      dataMartId={report.dataMart.id}
      reportTitle={report.title}
      className={className}
    />
  );
}
