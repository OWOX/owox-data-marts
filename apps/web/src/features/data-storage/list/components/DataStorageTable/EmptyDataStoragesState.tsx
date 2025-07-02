import { Button } from '@owox/ui/components/button';
import { DatabaseZap, Plus } from 'lucide-react';

export function EmptyDataStoragesState({ onOpenTypeDialog }: { onOpenTypeDialog?: () => void }) {
  return (
    <div className='dm-empty-state'>
      <DatabaseZap className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>Create your first Data Storage</h2>
      <p className='dm-empty-state-subtitle'>
        A Data Storage combines your data warehouse and access credentials — both required to start
        building Data Marts.
      </p>
      <Button variant='outline' onClick={onOpenTypeDialog}>
        <Plus className='h-4 w-4' />
        New Data Storage
      </Button>
    </div>
  );
}
