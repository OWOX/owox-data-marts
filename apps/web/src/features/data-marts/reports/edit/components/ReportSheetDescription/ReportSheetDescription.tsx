import type { ReactNode } from 'react';
import { SheetDescription } from '@owox/ui/components/sheet';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';
import { ReportFormMode, ReportGeneratedSqlAction } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReportDeepLink } from '../../hooks/useReportDeepLink';

interface ReportSheetDescriptionProps {
  mode: ReportFormMode;
  report?: DataMartReport | null;
  /**
   * Whether the report form has unsaved edits that would change the SQL.
   * Preview SQL shows the saved report, so its dialog says when those edits
   * are left out.
   */
  hasUnsavedSqlChanges?: boolean;
  children: ReactNode;
}

/**
 * Sheet header description row shared by the report edit sheets:
 * renders the description text and, in EDIT mode, a Copy link button
 * with the report's deep link and a Preview SQL button.
 */
export function ReportSheetDescription({
  mode,
  report,
  hasUnsavedSqlChanges = false,
  children,
}: ReportSheetDescriptionProps) {
  const editedReport = mode === ReportFormMode.EDIT ? report : undefined;
  const reportLink = useReportDeepLink(editedReport);

  return (
    <div className='flex w-full items-center gap-4'>
      <SheetDescription>{children}</SheetDescription>
      {editedReport && (
        <div className='flex shrink-0 items-center gap-2'>
          {reportLink && <CopyLinkButton link={reportLink} ariaLabel='Copy link to this report' />}
          <ReportGeneratedSqlAction
            report={editedReport}
            variant='header-link'
            hasUnsavedSqlChanges={hasUnsavedSqlChanges}
          />
        </div>
      )}
    </div>
  );
}
