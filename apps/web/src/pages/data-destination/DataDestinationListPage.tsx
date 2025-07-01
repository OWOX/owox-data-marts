import { DataDestinationProvider } from '../../features/data-destination';
import { Button } from '@owox/ui/components/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { DataDestinationList } from '../../features/data-destination/list';

export const DataDestinationListPage = () => {
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  return (
    <div>
      <header className='flex items-center justify-between px-12 pt-6 pb-4'>
        <h1 className='text-2xl font-medium'>Data Destinations</h1>
        <Button
          variant='secondary'
          size='sm'
          onClick={() => {
            setIsCreateSheetOpen(true);
          }}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Data Destination
        </Button>
      </header>

      <div className='px-4 sm:px-12'>
        <DataDestinationProvider>
          <DataDestinationList
            isCreateSheetInitiallyOpen={isCreateSheetOpen}
            onCreateSheetClose={() => {
              setIsCreateSheetOpen(false);
            }}
          />
        </DataDestinationProvider>
      </div>
    </div>
  );
};
