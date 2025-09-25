import { Search, Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import type { Table } from '@tanstack/react-table';
import type { ScheduledTrigger } from '../../model/scheduled-trigger.model';

interface TableToolbarProps {
  table: Table<ScheduledTrigger>;
  searchInputId: string;
  onAddTrigger: () => void;
  filterValue: string;
  onFilterChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Table toolbar component containing search, column visibility menu, and add button
 */
export function TableToolbar({
  searchInputId,
  onAddTrigger,
  filterValue,
  onFilterChange,
}: TableToolbarProps) {
  return (
    <div className='dm-card-toolbar'>
      <div className='dm-card-toolbar-left'>
        <div className='dm-card-toolbar-search'>
          <Search className='dm-card-toolbar-search-icon' aria-hidden='true' />
          <Input
            id={searchInputId}
            placeholder='Search triggers'
            value={filterValue}
            onChange={onFilterChange}
            className='dm-card-toolbar-search-input'
            aria-label='Search triggers'
          />
        </div>
      </div>
      <div className='dm-card-toolbar-right'>
        <Button
          variant='outline'
          className='dm-card-toolbar-btn-primary'
          onClick={onAddTrigger}
          aria-label='Add new trigger'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add Trigger
        </Button>
      </div>
    </div>
  );
}
