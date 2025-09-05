import { Button } from '@owox/ui/components/button';
import { PlusIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import { DataMartStatus } from '../../../../shared/enums/data-mart-status.enum';
import type { DataMartStatusInfo } from '../../../../shared/types/data-mart-status.model';

interface AddReportButtonProps {
  dataMartStatus?: DataMartStatusInfo;
  onAddReport: () => void;
}

/**
 * Add Report Button component with conditional rendering and tooltip
 * Only shows for Google Sheets destinations with proper validation
 */
export function AddReportButton({ dataMartStatus, onAddReport }: AddReportButtonProps) {
  const isDisabled = dataMartStatus?.code === DataMartStatus.DRAFT;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            onClick={onAddReport}
            variant='outline'
            size='sm'
            aria-label='Add new report'
            disabled={isDisabled}
          >
            <PlusIcon className='h-4 w-4' />
            Add Report
          </Button>
        </span>
      </TooltipTrigger>
      {isDisabled && (
        <TooltipContent>
          <p>To create a report, publish the Data Mart first</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}
