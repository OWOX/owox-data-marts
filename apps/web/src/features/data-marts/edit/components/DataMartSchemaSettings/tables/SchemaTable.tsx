import { Button } from '@owox/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import {
  type ColumnDef,
  type Row,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types.ts';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types.ts';
import { TableToolbar } from '../components';
import { schemaFieldFilter, useColumnVisibility, useTableFilter } from '../hooks';
import type { DragContextProps, RowComponentProps } from './BaseSchemaTable';
import type { Props as SortableContextProps } from '@dnd-kit/sortable/dist/components/SortableContext';

interface SchemaTableProps<T extends BaseSchemaField> {
  fields: T[];
  columns: ColumnDef<T>[];
  onFieldsChange?: (fields: T[]) => void;
  onAddRow?: () => void;
  fieldsForStatusCount?: T[]; // Separate array of fields used for status counting
  onSearchChange?: (searchValue: string) => void; // Callback for search value changes
  DragContext: ComponentType<SortableContextProps>; // Drag-and-drop context component
  dragContextProps: DragContextProps; // Props for the drag-and-drop context
  RowComponent?: ComponentType<RowComponentProps<Row<T>>>; // Custom row component for drag-and-drop
  getRowId?: (row: Row<T>) => string | number; // Function to get the ID for a row
}

export function SchemaTable<T extends BaseSchemaField>({
  fields,
  columns: initialColumns,
  onAddRow,
  fieldsForStatusCount,
  onSearchChange,
  DragContext,
  dragContextProps,
  RowComponent = TableRow as ComponentType<RowComponentProps<Row<T>>>,
  getRowId,
}: SchemaTableProps<T>) {
  // Use the columns provided by the parent component
  const columns = initialColumns;

  // Column visibility state
  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns);

  // Create table instance
  const table = useReactTable<T>({
    data: fields,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    enableGlobalFilter: true,
    globalFilterFn: schemaFieldFilter, // Use custom filter function that only searches in name, alias, and description
    defaultColumn: {
      enableResizing: true,
      size: 0,
      minSize: 0,
    },
  });

  // Table filter hook
  const { value: filterValue, onChange: handleFilterChange, searchValue } = useTableFilter(table);

  // Use ref to track previous search value to prevent infinite loops
  const prevSearchValueRef = useRef<string>('');

  // Call onSearchChange callback when searchValue changes
  useEffect(() => {
    // Only call onSearchChange if the search value has actually changed
    if (onSearchChange && searchValue !== prevSearchValueRef.current) {
      prevSearchValueRef.current = searchValue;
      onSearchChange(searchValue);
    }
  }, [searchValue, onSearchChange]);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<DataMartSchemaFieldStatus, number> = {
      [DataMartSchemaFieldStatus.CONNECTED]: 0,
      [DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH]: 0,
      [DataMartSchemaFieldStatus.DISCONNECTED]: 0,
    };

    // Use fieldsForStatusCount if provided, otherwise use all fields
    const fieldsToCount = fieldsForStatusCount ?? fields;

    fieldsToCount.forEach(field => {
      if (field.status in counts) {
        counts[field.status]++;
      }
    });

    return counts;
  }, [fields, fieldsForStatusCount]);

  // Generate unique IDs for accessibility
  const searchInputId = 'schema-fields-search-input';
  const tableId = 'schema-fields-table';

  return (
    <div className='space-y-4'>
      {onAddRow && (
        <TableToolbar
          table={table}
          searchInputId={searchInputId}
          onAddField={onAddRow}
          filterValue={filterValue}
          onFilterChange={handleFilterChange}
          statusCounts={statusCounts}
        />
      )}
      <div className='dm-card-table-wrap mb-0'>
        <Table id={tableId} className='w-full table-auto' role='table'>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className='bg-secondary dark:bg-background'
                    style={{
                      width: header.getSize() !== 0 ? header.getSize() : undefined,
                      whiteSpace: 'nowrap',
                      cursor: 'default',
                      position:
                        header.column.id === 'dragHandle' ||
                        header.column.id === 'status' ||
                        header.column.id === 'name' ||
                        header.column.id === 'actions'
                          ? 'sticky'
                          : undefined,
                      left:
                        header.column.id === 'dragHandle'
                          ? 0
                          : header.column.id === 'status'
                            ? 20
                            : header.column.id === 'name'
                              ? 56
                              : undefined,
                      right: header.column.id === 'actions' ? 0 : undefined,
                      zIndex:
                        header.column.id === 'dragHandle' ||
                        header.column.id === 'status' ||
                        header.column.id === 'name' ||
                        header.column.id === 'actions'
                          ? 1
                          : undefined,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : typeof header.column.columnDef.header === 'function'
                        ? header.column.columnDef.header(header.getContext())
                        : header.column.columnDef.header}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className='dm-card-table-body'>
            {table.getRowModel().rows.length ? (
              <DragContext {...dragContextProps}>
                {table.getRowModel().rows.map(row => (
                  <RowComponent key={row.id} id={getRowId ? getRowId(row) : row.index} row={row}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell
                        key={cell.id}
                        className='bg-background dark:bg-muted'
                        style={{
                          width: cell.column.getSize() !== 0 ? cell.column.getSize() : undefined,
                          whiteSpace: 'pre',
                          paddingTop: 8,
                          paddingBottom: 8,
                          position:
                            cell.column.id === 'dragHandle' ||
                            cell.column.id === 'status' ||
                            cell.column.id === 'name' ||
                            cell.column.id === 'actions'
                              ? 'sticky'
                              : undefined,
                          left:
                            cell.column.id === 'dragHandle'
                              ? 0
                              : cell.column.id === 'status'
                                ? 20
                                : cell.column.id === 'name'
                                  ? 56
                                  : undefined,
                          right: cell.column.id === 'actions' ? 0 : undefined,
                          zIndex:
                            cell.column.id === 'dragHandle' ||
                            cell.column.id === 'status' ||
                            cell.column.id === 'name' ||
                            cell.column.id === 'actions'
                              ? 1
                              : undefined,
                        }}
                      >
                        {cell.column.columnDef.cell &&
                        typeof cell.column.columnDef.cell === 'function'
                          ? cell.column.columnDef.cell(cell.getContext())
                          : null}
                      </TableCell>
                    ))}
                  </RowComponent>
                ))}
              </DragContext>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='text-center text-gray-400'
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Output schema has no configured fields
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {onAddRow && (
        <Button
          variant='outline'
          className='dm-card-table-add-field-btn bg-background dark:bg-muted w-full cursor-pointer rounded-t-none border-0'
          onClick={onAddRow}
          aria-label='Add new field'
        >
          <Plus className='h-4 w-4' aria-hidden='true' />
          Add Field
        </Button>
      )}
    </div>
  );
}
