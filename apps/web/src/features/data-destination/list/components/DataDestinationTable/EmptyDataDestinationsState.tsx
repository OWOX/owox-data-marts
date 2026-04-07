import { Button } from '@owox/ui/components/button';
import { ArchiveRestore, Plus } from 'lucide-react';

export function EmptyDataDestinationsState({
  onOpenTypeDialog,
}: {
  onOpenTypeDialog?: () => void;
}) {
  return (
    <div className='dm-empty-state' data-testid='destEmptyState'>
      <ArchiveRestore className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>Connect your reporting tools</h2>
      <p className='dm-empty-state-subtitle'>
        Send Data Mart data to dashboards and reports by connecting your reporting tools.
      </p>
      <Button variant='outline' onClick={onOpenTypeDialog}>
        <Plus className='h-4 w-4' />
        New Destination
      </Button>
    </div>
  );
}
