import { FileText } from 'lucide-react';
import { cn } from '@owox/ui/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

import { DataDestinationType } from '../../../../data-destination/shared';
import { getGoogleSheetTabUrl } from '../utils';
import {
  isGoogleSheetsDestinationConfig,
  type DataMartReport,
} from '../model/types/data-mart-report';

interface ReportOpenDocumentActionProps {
  report: DataMartReport;
  className?: string;
}

export function ReportOpenDocumentAction({ report, className }: ReportOpenDocumentActionProps) {
  if (report.dataDestination.type !== DataDestinationType.GOOGLE_SHEETS) {
    return null;
  }

  if (!isGoogleSheetsDestinationConfig(report.destinationConfig)) {
    return null;
  }

  const { spreadsheetId, sheetId } = report.destinationConfig;

  if (!spreadsheetId || !sheetId) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={getGoogleSheetTabUrl(spreadsheetId, sheetId)}
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
