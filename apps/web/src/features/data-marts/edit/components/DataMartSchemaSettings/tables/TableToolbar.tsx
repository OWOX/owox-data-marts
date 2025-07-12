import { Search, Plus } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import type { Table } from '@tanstack/react-table';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types.ts';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types.ts';
import { SchemaFieldStatusIcon } from './SchemaFieldStatusIcon';

interface TableToolbarProps<TData extends BaseSchemaField> {
  table: Table<TData>;
  searchInputId: string;
  onAddField: () => void;
  filterValue: string;
  onFilterChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  statusCounts?: Record<DataMartSchemaFieldStatus, number>;
}

/**
 * Table toolbar component containing search, column visibility menu, and add button
 */
export function TableToolbar<TData extends BaseSchemaField>({
  searchInputId,
  onAddField,
  filterValue,
  onFilterChange,
  statusCounts,
}: TableToolbarProps<TData>) {
  return (
    <div className='dm-card-toolbar'>
      <div className='dm-card-toolbar-left'>
        <div className='dm-card-toolbar-search'>
          <Search className='dm-card-toolbar-search-icon' aria-hidden='true' />
          <Input
            id={searchInputId}
            placeholder='Search fields'
            value={filterValue}
            onChange={onFilterChange}
            className='dm-card-toolbar-search-input'
            aria-label='Search fields'
          />
        </div>
      </div>
      <div className='dm-card-toolbar-right'>
        {statusCounts && (
          <div className='mr-3 flex items-center gap-3'>
            {Object.entries(statusCounts).map(([status, count]) => {
              if (count === 0) return null;
              return (
                <div key={status} className='flex items-center gap-1'>
                  <SchemaFieldStatusIcon status={status} />
                  <span className='text-sm font-medium text-gray-500'>{count}</span>
                </div>
              );
            })}
          </div>
        )}
        <Button
          variant='outline'
          className='dm-card-toolbar-btn-primary'
          onClick={onAddField}
          aria-label='Add new field'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add Field
        </Button>
      </div>
    </div>
  );
}
