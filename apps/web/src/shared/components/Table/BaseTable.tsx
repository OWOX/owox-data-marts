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

  return (
    <>
      {/* TOOLBAR */}
      {hasToolbar && (
        <div className='dm-card-toolbar'>
          {/* LEFT Column */}
          {renderToolbarLeft && (
            <div className='dm-card-toolbar-left'>{renderToolbarLeft(table)}</div>
          )}

          {/* RIGHT Column */}
          {renderToolbarRight && (
            <div className='dm-card-toolbar-right'>{renderToolbarRight(table)}</div>
          )}
        </div>
      )}
      {/* end: TOOLBAR */}

      {/* TABLE */}
      <div className='dm-card-table-wrap'>
        <TableComponent id={tableId} className='dm-card-table' role='table' aria-label={ariaLabel}>
          <TableHeader className='dm-card-table-header'>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className='dm-card-table-header-row'>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      className='group relative [&:has([role=checkbox])]:pl-6 [&>[role=checkbox]]:translate-y-[2px]'
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
                          className='absolute top-0 right-[2px] flex h-full w-1 cursor-col-resize items-center justify-center bg-transparent select-none group-hover:bg-neutral-200/50 hover:bg-neutral-200'
                          title='Drag to resize. Double-click to reset width'
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className='dm-card-table-body'>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='dm-card-table-body-row group'
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
                      className={`px-6 pr-0 whitespace-normal [&>[role=checkbox]]:translate-y-[2px] ${cell.column.id === 'actions' ? 'actions-cell' : ''} ${cell.column.id === 'createdAt' ? 'whitespace-nowrap' : ''} ${cell.column.id === 'healthStatus' ? 'pl-5' : ''}`}
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
                  className='dm-card-table-body-row-empty'
                >
                  {renderEmptyState()}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className='dm-card-table-body-row-empty'
                >
                  Oops! Nothing matched your search
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
