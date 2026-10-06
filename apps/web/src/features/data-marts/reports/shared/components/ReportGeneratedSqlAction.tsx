import {
  GeneratedSqlViewer,
  type GeneratedSqlViewerVariant,
} from '../../../edit/components/ReportColumnPicker/GeneratedSqlViewer';
import { isGeneratedSqlSupported } from '../utils';
import type { DataMartReport } from '../model/types/data-mart-report';

interface ReportGeneratedSqlActionProps {
  report: DataMartReport;
  variant?: GeneratedSqlViewerVariant;
  hasUnsavedChanges?: boolean;
  className?: string;
}

export function ReportGeneratedSqlAction({
  report,
  variant,
  hasUnsavedChanges,
  className,
}: ReportGeneratedSqlActionProps) {
  if (!isGeneratedSqlSupported(report.dataMart.definitionType, report.dataMart.storage.type)) {
    return null;
  }

  return (
    <GeneratedSqlViewer
      reportId={report.id}
      dataMartId={report.dataMart.id}
      reportTitle={report.title}
      variant={variant}
      hasUnsavedChanges={hasUnsavedChanges}
      className={className}
    />
  );
}
