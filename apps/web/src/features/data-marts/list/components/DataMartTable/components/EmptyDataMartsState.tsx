import { Link } from 'react-router-dom';
import { useProjectRoute } from '../../../../../../shared/hooks';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { DataMartPlusIcon } from '../../../../../../shared';

export function EmptyDataMartsState() {
  const { scope } = useProjectRoute();
  return (
    <div className='dm-empty-state'>
      <DataMartPlusIcon className='dm-empty-state-ico' />
      <h2 className='dm-empty-state-title'>Create your first Data Mart</h2>
      <p className='dm-empty-state-subtitle'>
        Data Marts help you organize and analyze your data effectively.
      </p>
      <Link to={scope('/data-marts/create')}>
        <Button variant='outline'>
          <Plus className='h-4 w-4' />
          New Data Mart
        </Button>
      </Link>
    </div>
  );
}
