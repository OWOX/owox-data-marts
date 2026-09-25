import { createContext, useContext, useMemo, useState } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { TablePagination } from '@owox/ui/components/common/table-pagination';
import { cn } from '@owox/ui/lib/utils';
import type { DataMartPreviewCell, DataMartPreviewColumnDto } from '../../../shared/types/api';
import type { FilterRule, SortRule } from '../../../shared/types/output-config';
import { FilterEditorPopover } from '../ReportColumnPicker/FilterEditorPopover';
import {
  isArrayFieldType,
  isFilterableType,
} from '../ReportColumnPicker/output-controls-operators';
import type { PreviewFilterTypes } from './preview-filter-types';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PreviewResultsTableProps {
  columns: DataMartPreviewColumnDto[];
  rows: DataMartPreviewCell[][];
  filters: FilterRule[];
  /** Comparison type per saved field; a column missing from it falls back to its reported type. */
  filterTypes?: PreviewFilterTypes;
  /** Replaces the column's filter (one per column), or removes it when `rule` is null. */
  onFilterChange: (column: string, rule: FilterRule | null) => void;
  filtersDisabled?: boolean;
  /** The applied ORDER BY column, if any. */
  sort?: SortRule | null;
  onSortChange?: (sort: SortRule | null) => void;
}

interface FilterContextValue {
  filters: FilterRule[];
  filterTypes?: PreviewFilterTypes;
  onFilterChange: PreviewResultsTableProps['onFilterChange'];
  disabled?: boolean;
  sort?: SortRule | null;
  onSortChange?: PreviewResultsTableProps['onSortChange'];
}

// Warehouses cannot ORDER BY these: arrays, nested records and semi-structured values.
const UNSORTABLE_TYPES = new Set([
  'RECORD',
  'STRUCT',
  'JSON',
  'GEOGRAPHY',
  'VARIANT',
  'OBJECT',
  'MAP',
  'SUPER',
]);

function isSortableType(fieldType: string): boolean {
  if (!fieldType || isArrayFieldType(fieldType)) return false;
  const base = /^[A-Za-z]+/.exec(fieldType.trim())?.[0].toUpperCase() ?? '';
  return !UNSORTABLE_TYPES.has(base);
}

/** asc → desc → no sort, per column; another column starts again at asc. */
function nextSort(column: string, current: SortRule | null | undefined): SortRule | null {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

// Filters reach the headers through context, not through the column definitions: rebuilding the
// definitions remounts every header, which would close an open filter popover mid-edit.
const PreviewFilterContext = createContext<FilterContextValue>({
  filters: [],
  onFilterChange: () => undefined,
});

function PreviewColumnHeader({ column }: { column: DataMartPreviewColumnDto }) {
  const { filters, filterTypes, onFilterChange, disabled, sort, onSortChange } =
    useContext(PreviewFilterContext);
  const fieldType = filterTypes?.get(column.name) ?? column.type ?? '';
  const sortable = Boolean(onSortChange) && isSortableType(fieldType);
  const direction = sort?.column === column.name ? sort.direction : null;
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  const name = (
    <span className='text-foreground truncate text-xs font-semibold uppercase'>{column.name}</span>
  );
  return (
    <div className='group/header flex items-start justify-between gap-2'>
      <div className='min-w-0' title={column.alias ?? column.name}>
        {sortable ? (
          <button
            type='button'
            disabled={disabled}
            onClick={() => onSortChange?.(nextSort(column.name, sort))}
            aria-label={`Sort by ${column.name}`}
            aria-sort={
              direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
            }
            className='hover:text-primary flex max-w-full items-center gap-1 text-left disabled:cursor-not-allowed'
          >
            {name}
            <SortIcon
              className={cn(
                'size-3 shrink-0 transition-opacity',
                direction
                  ? 'text-primary opacity-100'
                  : 'text-muted-foreground opacity-0 group-hover/header:opacity-100'
              )}
            />
          </button>
        ) : (
          <div className='flex'>{name}</div>
        )}
        {column.type && (
          <div className='text-muted-foreground truncate text-[10px] font-normal uppercase'>
            {column.type}
          </div>
        )}
      </div>
      <ColumnFilterButton
        column={column}
        fieldType={fieldType}
        filter={filters.find(rule => rule.column === column.name)}
        onFilterChange={onFilterChange}
        disabled={disabled}
      />
    </div>
  );
}

function PreviewCellValue({ value }: { value: DataMartPreviewCell }) {
  if (value === null) {
    return <span className='text-muted-foreground italic'>null</span>;
  }
  const text = String(value);
  return (
    <span className='block truncate' title={text}>
      {text}
    </span>
  );
}

function ColumnFilterButton({
  column,
  fieldType,
  filter,
  onFilterChange,
  disabled,
}: {
  column: DataMartPreviewColumnDto;
  /** The saved field's comparison type: a REPEATED field compares as ARRAY<T>, not as T. */
  fieldType: string;
  filter: FilterRule | undefined;
  onFilterChange: PreviewResultsTableProps['onFilterChange'];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!isFilterableType(fieldType)) return null;

  return (
    <FilterEditorPopover
      open={open}
      onOpenChange={setOpen}
      column={column.name}
      fieldType={fieldType}
      displayLabel={`Filter · ${column.name}`}
      headerBadge='WHERE'
      initialRule={filter}
      onApply={rule => {
        onFilterChange(column.name, rule);
      }}
      onDelete={
        filter
          ? () => {
              onFilterChange(column.name, null);
            }
          : undefined
      }
      trigger={
        <button
          type='button'
          disabled={disabled}
          aria-label={`Filter ${column.name}`}
          className={cn(
            'hover:bg-muted rounded p-1 transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
            filter
              ? 'text-primary opacity-100'
              : 'text-muted-foreground opacity-0 group-hover/header:opacity-100 focus-visible:opacity-100',
            open && 'opacity-100'
          )}
        >
          <Filter className='size-3.5' />
        </button>
      }
    />
  );
}

export function PreviewResultsTable({
  columns,
  rows,
  filters,
  filterTypes,
  onFilterChange,
  filtersDisabled,
  sort,
  onSortChange,
}: PreviewResultsTableProps) {
  const columnDefs = useMemo<ColumnDef<DataMartPreviewCell[]>[]>(
    () =>
      columns.map((column, index) => ({
        id: `c${String(index)}`,
        accessorFn: row => row[index],
        header: () => <PreviewColumnHeader column={column} />,
        cell: info => <PreviewCellValue value={info.getValue() as DataMartPreviewCell} />,
      })),
    [columns]
  );
  const filterContext = useMemo(
    () => ({
      filters,
      filterTypes,
      onFilterChange,
      disabled: filtersDisabled,
      sort,
      onSortChange,
    }),
    [filters, filterTypes, onFilterChange, filtersDisabled, sort, onSortChange]
  );

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE_OPTIONS[0] } },
    autoResetPageIndex: true,
  });

  return (
    <PreviewFilterContext.Provider value={filterContext}>
      <div className='space-y-3'>
        <div className='overflow-x-auto rounded-md border'>
          <Table className='min-w-full'>
            <TableHeader className='bg-muted/50'>
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id} className='hover:bg-transparent'>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} className='h-auto min-w-40 px-4 py-2 align-top'>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow className='hover:bg-transparent'>
                  <TableCell
                    colSpan={columns.length}
                    className='text-muted-foreground px-4 py-8 text-center text-sm'
                  >
                    No rows match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map(row => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className='max-w-80 px-4 py-2 text-sm'>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {rows.length > PAGE_SIZE_OPTIONS[0] && (
          <TablePagination
            table={table}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            displaySelected={false}
          />
        )}
      </div>
    </PreviewFilterContext.Provider>
  );
}
