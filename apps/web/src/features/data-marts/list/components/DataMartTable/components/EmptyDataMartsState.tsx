import { Link } from 'react-router-dom';
import { Button } from '@owox/ui/components/button';
import { Plus, PackagePlus } from 'lucide-react';

export function EmptyDataMartsState() {
  return (
    <div className='dm-empty-state'>
      <PackagePlus className='dm-empty-state-ico' strokeWidth={1} />
      <h2 className='dm-empty-state-title'>Create your first Data Mart</h2>
      <p className='dm-empty-state-subtitle'>
        Data Marts help you organize and analyze your data effectively.
      </p>
      <Link to={'/data-marts/create'}>
        <Button variant='outline'>
          <Plus className='h-4 w-4' />
          New Data Mart
        </Button>
      </Link>
    </div>
  );
}
