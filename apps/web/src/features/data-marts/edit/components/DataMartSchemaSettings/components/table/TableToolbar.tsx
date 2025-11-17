import { Button } from '@owox/ui/components/button';
import { SearchInput } from '@owox/ui/components/common/search-input';
import type { Table } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import type { BaseSchemaField } from '../../../../../shared/types/data-mart-schema.types';
import { DataMartSchemaFieldStatus } from '../../../../../shared/types/data-mart-schema.types';
import { SchemaFieldStatusIcon } from '../fields';

/**
 * Props for the TableToolbar component
 */
interface TableToolbarProps<TData extends BaseSchemaField> {
  /** The table instance */
  table: Table<TData>;
  /** Unique identifier for the search input */
  searchInputId: string;
  /** Callback function to call when the add field button is clicked */
  onAddField: () => void;
  /** Current filter value */
  filterValue: string;
  /** Callback function to call when the filter value changes */
  onFilterChange: (value: string) => void;
  /** Optional counts of fields by status */
  statusCounts?: Record<DataMartSchemaFieldStatus, number>;
  /** Whether the add field button should be disabled */
  disabled?: boolean;
}

/**
 * Table toolbar component containing search, status counts, and add button
 * Provides controls for filtering and adding new fields to the table
 */
export function TableToolbar<TData extends BaseSchemaField>({
  searchInputId,
  onAddField,
  filterValue,
  onFilterChange,
  statusCounts,
  disabled = false,
}: TableToolbarProps<TData>) {
  return (
    <div className='dm-card-toolbar'>
      <div className='dm-card-toolbar-left'>
        <SearchInput
          id={searchInputId}
          placeholder='Search fields'
          value={filterValue}
          onChange={onFilterChange}
          className='dm-card-toolbar-search-input'
          aria-label='Search fields'
        />
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
          className='dm-card-table-add-field-btn cursor-pointer'
          onClick={onAddField}
          disabled={disabled}
          aria-label='Add new field'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add Field
        </Button>
      </div>
    </div>
  );
}
