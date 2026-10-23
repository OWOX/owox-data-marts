import { FileText } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

import { getReportGoogleSheetUrl } from '../utils';
import type { DataMartReport } from '../model/types/data-mart-report';

interface ReportOpenDocumentActionProps {
  report: DataMartReport;
  className?: string;
}

export function ReportOpenDocumentAction({ report, className }: ReportOpenDocumentActionProps) {
  const href = getReportGoogleSheetUrl(report);
  if (!href) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={href}
            className={cn(
              'dm-card-table-body-row-actionbtn inline-flex !h-6 !w-6 items-center justify-center rounded-md',
              className
            )}
            aria-label={`Open document: ${report.title}`}
            target='_blank'
            rel='noopener noreferrer'
            onClick={e => {
              e.stopPropagation();
            }}
          >
            <FileText className='dm-card-table-body-row-actionbtn-icon' aria-hidden='true' />
          </a>
        </TooltipTrigger>

        <TooltipContent side='bottom' role='tooltip'>
          Open document
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
