import { type Table, type Row, flexRender } from '@tanstack/react-table';
import {
  Table as TableComponent,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@owox/ui/components/table';
import { TablePagination } from '@owox/ui/components/common/table-pagination';
import { getTableColumnSize } from '../../utils/getTableColumnSize';
import { cn } from '@owox/ui/lib/utils';

/**
 * Props for BaseTable component
 */
export interface BaseTableProps<TData> {
  /** Unique identifier for the table */
  tableId: string;
  /** Configured TanStack Table instance */
  table: Table<TData>;
  /** Optional callback for row click events */
  onRowClick?: (row: Row<TData>, event: React.MouseEvent) => void;
  /** Optional render function for left toolbar content */
  renderToolbarLeft?: (table: Table<TData>) => React.ReactNode;
  /** Optional render function for right toolbar content */
  renderToolbarRight?: (table: Table<TData>) => React.ReactNode;
  /** Optional render function for custom empty state */
  renderEmptyState?: () => React.ReactNode;
  /** Whether to show pagination (default: true) */
  showPagination?: boolean;
  /** Additional props to pass to TablePagination */
  paginationProps?: {
    displaySelected?: boolean;
  };
  /** Accessible label for the table */
  ariaLabel?: string;
}

/**
 * Shared base table component for rendering TanStack Table instances
 *
 * This component handles the common table rendering logic including:
 * - Table structure (header, body, rows, cells)
 * - Column resizing handles
 * - Empty state rendering
 * - Optional toolbar with render props
 * - Optional pagination
 *
 * The component is fully presentational and delegates all behavior
 * through props and the table instance.
 *
 * @example
 * ```tsx
 * <BaseTable
 *   tableId="my-table"
 *   table={table}
 *   onRowClick={(row, e) => navigate(`/item/${row.id}`)}
 *   renderToolbarLeft={(table) => <SearchInput />}
 *   renderToolbarRight={(table) => <CreateButton />}
 *   ariaLabel="Data items table"
 * />
 * ```
 */
export function BaseTable<TData>({
  tableId,
  table,
  onRowClick,
  renderToolbarLeft,
  renderToolbarRight,
  renderEmptyState,
  showPagination = true,
  paginationProps,
  ariaLabel = 'Data table',
}: BaseTableProps<TData>) {
  const hasToolbar = renderToolbarLeft ?? renderToolbarRight;
  const ACTIONS_COLUMN_ID = 'actions';

  const isActionsColumn = (columnId: string) => columnId === ACTIONS_COLUMN_ID;

  const baseHeaderClass =
    'relative [&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]';

  const actionsHeaderClass = cn(
    'sticky right-0 z-20',
    'bg-table-thead-sticky-bg',
    'after:pointer-events-none after:absolute after:inset-y-0 after:left-[-16px] after:w-[16px]',
    'after:bg-gradient-to-r after:from-transparent after:to-table-thead-sticky-bg'
  );

  const isCreatedAt = (columnId: string) => columnId === 'createdAt';
  const isHealthStatus = (columnId: string) => columnId === 'healthStatus';

  const baseCellClass =
    'px-6 pr-0 break-words whitespace-normal transition-colors duration-200 ease-out ' +
    'after:transition-opacity after:duration-150 after:ease-out ' +
    '[&>[role=checkbox]]:translate-y-[2px]';

  const actionsCellClass = cn(
    'sticky right-0 z-10 px-2',
    'group-hover:bg-table-tbody-sticky-hover-bg',
    'after:pointer-events-none after:absolute after:inset-y-0 after:left-[-24px] after:w-[24px]',
    'after:bg-gradient-to-r after:from-transparent after:to-table-tbody-sticky-hover-bg',
    'after:opacity-0 after:transition-opacity after:duration-200',
    'group-hover:after:opacity-100'
  );

  const createdAtClass = 'whitespace-nowrap';
  const healthStatusClass = 'pl-5';

  return (
    <>
      {/* TOOLBAR */}
      {hasToolbar && (
        <div className='mb-4 flex items-center justify-between gap-2 last:mb-0'>
          {/* LEFT Column */}
          {renderToolbarLeft && (
            <div className='flex items-center gap-2'>{renderToolbarLeft(table)}</div>
          )}

          {/* RIGHT Column */}
          {renderToolbarRight && (
            <div className='flex items-center gap-2'>{renderToolbarRight(table)}</div>
          )}
        </div>
      )}
      {/* end: TOOLBAR */}

      {/* TABLE */}
      <div className='mb-4 w-full last:mb-0'>
        <TableComponent
          id={tableId}
          className='w-full table-fixed'
          role='table'
          aria-label={ariaLabel}
        >
          <TableHeader className='bg-transparent'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='hover:bg-transparent'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        baseHeaderClass,
                        isActionsColumn(header.column.id) && actionsHeaderClass
                      )}
                      style={getTableColumnSize(header.column)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}

                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => {
                            header.column.resetSize();
                          }}
                          className='absolute top-0 right-[2px] h-full w-1 cursor-col-resize bg-transparent select-none hover:bg-neutral-200 dark:hover:bg-white/4'
                          title='Drag to resize. Double-click to reset width'
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className='border-b border-gray-200 bg-white dark:border-white/4 dark:bg-white/1'>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='group cursor-pointer transition-colors duration-200 hover:bg-black/4 dark:border-white/4 dark:bg-transparent dark:hover:bg-white/4'
                  onClick={
                    onRowClick
                      ? e => {
                          onRowClick(row, e);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        baseCellClass,
                        isActionsColumn(cell.column.id) && actionsCellClass,
                        isCreatedAt(cell.column.id) && createdAtClass,
                        isHealthStatus(cell.column.id) && healthStatusClass
                      )}
                      style={getTableColumnSize(cell.column)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : renderEmptyState ? (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='text-muted-foreground h-32 text-center'
                >
                  {renderEmptyState()}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='text-muted-foreground h-32 text-center'
                >
                  Oops! No data found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableComponent>
      </div>
      {/* end: TABLE */}

      {/* PAGINATION */}
      {showPagination && <TablePagination table={table} {...paginationProps} />}
      {/* end: PAGINATION */}
    </>
  );
}
