import { Button } from '@owox/ui/components/button';
import { ArchiveRestore, Plus } from 'lucide-react';

export function EmptyDataDestinationsState({
  onOpenTypeDialog,
}: {
  onOpenTypeDialog?: () => void;
}) {
  return (
    <div className='dm-empty-state'>
      <ArchiveRestore className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>Create your first Destination</h2>
      <p className='dm-empty-state-subtitle'>
        A Destination combines your reporting tool and access credentials — both needed to deliver
        data from Data Marts to your reports and dashboards.
      </p>
      <Button variant='outline' onClick={onOpenTypeDialog}>
        <Plus className='h-4 w-4' />
        New Destination
      </Button>
    </div>
  );
}
