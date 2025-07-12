import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type PaginationState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types.ts';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types.ts';
import { useTableFilter, useColumnVisibility, schemaFieldFilter } from './hooks';
import { TableToolbar } from './TableToolbar';
import { TablePagination } from './TablePagination';

interface SchemaTableProps<T extends BaseSchemaField> {
  fields: T[];
  columns: ColumnDef<T>[];
  onFieldsChange?: (fields: T[]) => void;
  onAddRow?: () => void;
}

export function SchemaTable<T extends BaseSchemaField>({
  fields,
  columns: initialColumns,
  onAddRow,
}: SchemaTableProps<T>) {
  // Use the columns provided by the parent component
  const columns = initialColumns;

  // Column visibility state
  const { columnVisibility, setColumnVisibility } = useColumnVisibility(columns);

  // Pagination state
  const [pagination, setPagination] = useState<PaginationState>({
    pageSize: 10,
    pageIndex: 0,
  });

  // Create table instance
  const table = useReactTable<T>({
    data: fields,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    state: {
      columnVisibility,
      pagination,
    },
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    enableGlobalFilter: true,
    globalFilterFn: schemaFieldFilter, // Use custom filter function that only searches in name, alias, and description
    defaultColumn: {
      enableResizing: true,
      size: 24,
      minSize: 24,
    },
  });

  // Table filter hook
  const { value: filterValue, onChange: handleFilterChange } = useTableFilter(table);

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<DataMartSchemaFieldStatus, number> = {
      [DataMartSchemaFieldStatus.CONNECTED]: 0,
      [DataMartSchemaFieldStatus.CONNECTED_WITH_DEFINITION_MISMATCH]: 0,
      [DataMartSchemaFieldStatus.DISCONNECTED]: 0,
    };

    fields.forEach(field => {
      if (field.status in counts) {
        counts[field.status]++;
      }
    });

    return counts;
  }, [fields]);

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
      <div className='dm-card-table-wrap'>
        {/* Single table with both header and body */}
        <Table id={tableId} className='w-full table-auto' role='table'>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    style={{
                      width: header.column.getSize(),
                      whiteSpace: 'nowrap',
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
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} className='group'>
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                        whiteSpace: 'nowrap',
                        paddingTop: 0,
                        paddingBottom: 0,
                      }}
                    >
                      {cell.column.columnDef.cell &&
                      typeof cell.column.columnDef.cell === 'function'
                        ? cell.column.columnDef.cell(cell.getContext())
                        : null}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='text-center'
                  style={{ whiteSpace: 'nowrap' }}
                >
                  No fields available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && <TablePagination table={table} />}
    </div>
  );
}
