import { Button } from '@owox/ui/components/button';
import { PlusIcon } from 'lucide-react';

interface AddReportButtonProps {
  onAddReport: () => void;
}

/**
 * Button that triggers report creation.
 * Destination-type filtering and visibility are handled by the parent DestinationCard.
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
