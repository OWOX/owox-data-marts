import type { ReactNode } from 'react';
import { SheetDescription } from '@owox/ui/components/sheet';
import { CopyLinkButton } from '@owox/ui/components/common/copy-link-button';
import { ReportFormMode } from '../../../shared';
import type { DataMartReport } from '../../../shared/model/types/data-mart-report';
import { useReportDeepLink } from '../../hooks/useReportDeepLink';

interface ReportSheetDescriptionProps {
  mode: ReportFormMode;
  report?: DataMartReport | null;
  children: ReactNode;
}

/**
 * Sheet header description row shared by the report edit sheets:
 * renders the description text and, in EDIT mode, a Copy link button
 * with the report's deep link.
 */
export function ReportSheetDescription({ mode, report, children }: ReportSheetDescriptionProps) {
  const reportLink = useReportDeepLink(mode === ReportFormMode.EDIT ? report : undefined);

  return (
    <div className='flex w-full items-center gap-4'>
      <SheetDescription>{children}</SheetDescription>
      {reportLink && <CopyLinkButton link={reportLink} ariaLabel='Copy link to this report' />}
    </div>
  );
}
