import { Button } from '@owox/ui/components/button';
import { ArchiveRestore, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EmptyDataMartDestinationsState() {
  return (
    <div className='dm-card'>
      <div className='dm-empty-state'>
        <ArchiveRestore className='dm-empty-state-ico' strokeWidth={1} />
        <h2 className='dm-empty-state-title'>Google Sheets, Looker Studio… and friends!</h2>
        <p className='dm-empty-state-subtitle'>
          To send your Data Mart's data to your favorite tools, create a Destination first.
        </p>
        <Button variant='outline' asChild>
          <Link to='/data-destinations' className='flex items-center gap-1'>
            Go to Destinations
            <ChevronRight className='h-4 w-4' />
          </Link>
        </Button>
      </div>
    </div>
  );
}
