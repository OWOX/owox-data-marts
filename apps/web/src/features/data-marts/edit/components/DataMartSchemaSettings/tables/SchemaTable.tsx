import { Button } from '@owox/ui/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { cn } from '@owox/ui/lib/utils';
import {
  type ColumnDef,
  type Row,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { FunctionSquare, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
import { useOutletContext } from 'react-router';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types.ts';
import { DataMartSchemaFieldStatus } from '../../../../shared/types/data-mart-schema.types.ts';
import { TableToolbar } from '../components';
import { schemaFieldFilter, useColumnVisibility, useTableFilter } from '../hooks';
import type { DragContextProps, RowComponentProps } from './BaseSchemaTable';
import type { Props as SortableContextProps } from '@dnd-kit/sortable/dist/components/SortableContext';
import type { DataMartContextType } from '../../../model/context/types';
import type { SchemaToolbar } from '../types/schema-toolbar';

// Sticky columns configuration
interface StickyColumnConfig {
  left?: number;
  right?: number;
  zIndex: number;
}

const STICKY_COLUMNS_CONFIG: Partial<Record<string, StickyColumnConfig>> = {
  dragHandle: { left: 0, zIndex: 1 },
  status: { left: 20, zIndex: 1 },
  name: { left: 56, zIndex: 1 },
  actions: { right: 0, zIndex: 1 },
};

// Helper function to get sticky column styles
function getStickyColumnStyle(columnId: string, baseStyle: React.CSSProperties = {}) {
  const stickyConfig = STICKY_COLUMNS_CONFIG[columnId];

  if (!stickyConfig) {
    return baseStyle;
  }

  return {
    ...baseStyle,
    position: 'sticky' as const,
    zIndex: stickyConfig.zIndex,
    ...(stickyConfig.left !== undefined && { left: stickyConfig.left }),
    ...(stickyConfig.right !== undefined && { right: stickyConfig.right }),
  };
}

/**
 * Lets one cell take over the columns beside it on the rows it applies to — the calculated
 * field's formula, which needs more room than a single cell and sits where a warehouse column's
 * Mode, PK and available aggregations would be, none of which says anything about it.
 */
export interface RowCellSpan<T extends BaseSchemaField> {
  /**
   * The consecutive column ids this row's span may cover, or nothing at all for a row that has no
   * span. The first VISIBLE id hosts the cell and covers the rest; the covered cells are not
   * rendered. Every id must be able to host the cell, since hiding a column moves the host to the
   * next one rather than dropping the span.
   *
   * Row-derived rather than one band for the whole table, because the band ENDS at a different
   * column per row: a calculated field's formula runs through "Σ available", while a row-level
   * field's stops before it — that column carries a control the row-level field owns.
   */
  bandFor: (row: Row<T>) => readonly string[];
}

interface SchemaTableProps<T extends BaseSchemaField> {
  fields: T[];
  columns: ColumnDef<T>[];
  /** Optional cell span, applied per row. Omit for a table where every cell is its own column. */
  rowCellSpan?: RowCellSpan<T>;
  onFieldsChange?: (fields: T[]) => void;
  onAddRow?: () => void;
  /** Second toolbar action beside "Add Field"; omit to hide it. */
  onAddCalculatedField?: () => void;
  fieldsForStatusCount?: T[]; // Separate array of fields used for status counting
  onSearchChange?: (searchValue: string) => void; // Callback for search value changes
  dragContext: ComponentType<SortableContextProps>; // Drag-and-drop context component
  dragContextProps: DragContextProps; // Props for the drag-and-drop context
  rowComponent?: ComponentType<RowComponentProps<Row<T>>>; // Custom row component for drag-and-drop
  getRowId?: (row: Row<T>) => string | number; // Function to get the ID for a row
  schemaToolbar: SchemaToolbar; // Schema toolbar component
}

export function SchemaTable<T extends BaseSchemaField>({
  fields,
  columns: initialColumns,
  rowCellSpan,
  onAddRow,
  onAddCalculatedField,
  fieldsForStatusCount,
  onSearchChange,
  dragContext,
  dragContextProps,
  rowComponent = TableRow as ComponentType<RowComponentProps<Row<T>>>,
  getRowId,
  schemaToolbar,
}: SchemaTableProps<T>) {
  // Get schema actualization loading state and current data mart from context
  const { isSchemaActualizationLoading, dataMart } = useOutletContext<DataMartContextType>();

  // Use the columns provided by the parent component
  const columns = initialColumns;

  // Create capitalized component references for JSX usage
  const DragContext = dragContext;
  const RowComponent = rowComponent;

  // Column visibility state, persisted per data mart so it survives tab switches and reloads
  const columnVisibilityStorageKey = dataMart?.id
    ? `data-mart-schema-column-visibility-${dataMart.id}`
    : undefined;
  const { columnVisibility, setColumnVisibility } = useColumnVisibility(
    columns,
    columnVisibilityStorageKey
  );

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
          onAddCalculatedField={onAddCalculatedField}
          filterValue={filterValue}
          onFilterChange={handleFilterChange}
          statusCounts={statusCounts}
          disabled={isSchemaActualizationLoading}
          schemaToolbar={schemaToolbar}
        />
      )}
      <div className='mb-0 w-full'>
        <Table id={tableId} className='w-full table-auto' role='table'>
          <TableHeader className='bg-transparent'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='hover:bg-transparent'>
                {headerGroup.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className='bg-secondary dark:bg-background'
                    style={getStickyColumnStyle(header.column.id, {
                      width: header.getSize() !== 0 ? header.getSize() : undefined,
                      whiteSpace: 'nowrap',
                      cursor: 'default',
                    })}
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
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {table.getRowModel().rows.length ? (
              <DragContext {...dragContextProps}>
                {table.getRowModel().rows.map(row => {
                  const cells = row.getVisibleCells();
                  const band = rowCellSpan?.bandFor(row);
                  const spannedIds = band?.length ? new Set(band) : undefined;
                  // Resolved against the VISIBLE cells, not the band: a hidden column anywhere in
                  // the band — its first, its last — shortens the span instead of running the row
                  // one cell long or losing the spanning cell altogether.
                  const spanStart = spannedIds
                    ? cells.findIndex(cell => spannedIds.has(cell.column.id))
                    : -1;
                  let spanEnd = spanStart;
                  while (
                    spanEnd !== -1 &&
                    spanEnd + 1 < cells.length &&
                    spannedIds?.has(cells[spanEnd + 1].column.id)
                  ) {
                    spanEnd++;
                  }

                  return (
                    <RowComponent
                      key={row.id}
                      id={getRowId ? getRowId(row) : row.index}
                      row={row}
                      className={row.original.isHiddenForReporting ? 'opacity-70' : undefined}
                    >
                      {cells.map((cell, index) => {
                        if (spanStart !== -1 && index > spanStart && index <= spanEnd) return null;
                        const colSpan =
                          index === spanStart && spanEnd > spanStart ? spanEnd - spanStart + 1 : 1;
                        const covered = cells.slice(index, index + colSpan);
                        const size = covered.reduce((total, c) => total + c.column.getSize(), 0);
                        return (
                          <TableCell
                            key={cell.id}
                            colSpan={colSpan > 1 ? colSpan : undefined}
                            className='bg-background dark:bg-muted'
                            style={getStickyColumnStyle(cell.column.id, {
                              width: size !== 0 ? size : undefined,
                              whiteSpace: 'pre',
                              paddingTop: 8,
                              paddingBottom: 8,
                            })}
                          >
                            {cell.column.columnDef.cell &&
                            typeof cell.column.columnDef.cell === 'function'
                              ? cell.column.columnDef.cell(cell.getContext())
                              : null}
                          </TableCell>
                        );
                      })}
                    </RowComponent>
                  );
                })}
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
        // `flex-1`, not `w-full`: Button's own base class sets `shrink-0`, so two 100%-wide
        // buttons overflowed this row by exactly its width and pushed the second one out of the
        // card. Growing from a zero basis splits the row between them, and leaves a lone
        // "Add Field" filling it exactly as it did before.
        <div className='flex'>
          <Button
            variant='outline'
            className={cn(
              'bg-background dark:bg-muted flex-1 rounded-t-none border-0',
              // The two halves are one footer, not two pills: the corner each keeps on the side
              // they meet notched their junction. Only the INNER corner goes, and only when there
              // is something to meet — a lone "Add Field" fills the row and keeps both.
              onAddCalculatedField && 'rounded-br-none'
            )}
            onClick={onAddRow}
            disabled={isSchemaActualizationLoading}
            aria-label='Add new field'
          >
            <Plus className='h-4 w-4' aria-hidden='true' />
            Add Field
          </Button>
          {onAddCalculatedField && (
            <Button
              variant='outline'
              className='bg-background dark:bg-muted flex-1 rounded-t-none rounded-bl-none border-0 border-l'
              onClick={onAddCalculatedField}
              disabled={isSchemaActualizationLoading}
              aria-label='Add calculated field'
            >
              <FunctionSquare className='h-4 w-4' aria-hidden='true' />
              Add Calculated Field
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
