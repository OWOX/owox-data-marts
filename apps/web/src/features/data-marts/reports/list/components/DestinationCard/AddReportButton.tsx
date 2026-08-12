import { Button } from '@owox/ui/components/button';
import { PlusIcon } from 'lucide-react';

interface AddReportButtonProps {
  onAddReport: () => void;
}

/**
 * Add Report Button component with conditional rendering and tooltip
 * Only shows for Google Sheets destinations with proper validation
 */
export function AddReportButton({ onAddReport }: AddReportButtonProps) {
  return (
    <Button
      onClick={onAddReport}
      variant='outline'
      size='sm'
      aria-label='Add new report'
      data-testid='reportCreateButton'
      className='text-foreground'
    >
      <PlusIcon className='text-foreground h-4 w-4' />
      New Report
    </Button>
  );
}
