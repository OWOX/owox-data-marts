import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { ColumnDef, Row, Table } from '@tanstack/react-table';
import type { ComponentType } from 'react';
import { useCallback, useMemo } from 'react';
import type { SortingStrategy } from '@dnd-kit/sortable';
import type { BaseSchemaField } from '../../../../shared/types/data-mart-schema.types';
import { EditableText } from '@owox/ui/components/common/editable-text';
import {
  SchemaFieldActionsButton,
  SchemaFieldPrimaryKeyCheckbox,
  SchemaFieldStatusIcon,
  TableActionsButton,
} from '../components';
import { asString } from '../utils';
import { SchemaTable } from './SchemaTable';

// Extended column definition with optional columnIndex property
export type ExtendedColumnDef<T extends BaseSchemaField> = ColumnDef<T> & {
  columnIndex?: number;
};

// Import the Props type from @dnd-kit/sortable for SortableContext
import type { Props as SortableContextProps } from '@dnd-kit/sortable/dist/components/SortableContext';

// Type for the drag context props (used with SortableContext from @dnd-kit/sortable)
export interface DragContextProps {
  items: (string | number)[];
  strategy: SortingStrategy;
  // Children is provided by the component that uses DragContext, not in the dragContextProps object
  children?: React.ReactNode;
}

// Type for the row component props (compatible with both SortableTableRow and TableRow)
export interface RowComponentProps<T = unknown> {
  id: string | number;
  row?: T;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Props for the BaseSchemaTable component
 */
export interface BaseSchemaTableProps<T extends BaseSchemaField> {
  /** The fields to display in the table */
  fields: T[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: T[]) => void;
  /** Function to create a new field */
  createNewField: () => T;
  /** Function to render the type column cell */
  renderTypeCell: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Additional columns to add to the table */
  additionalColumns?: ExtendedColumnDef<T>[];
  /** Fields to use for status counting (defaults to fields) */
  fieldsForStatusCount?: T[];
  /** Callback function to call when the search value changes */
  onSearchChange?: (searchValue: string) => void;
  /** Custom header for the name column */
  nameColumnHeader?: () => React.ReactNode;
  /** Custom cell for the name column */
  nameColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the primary key column */
  primaryKeyColumnCell?: (props: {
    row: Row<T>;
    updateField: (index: number, updatedField: Partial<T>) => void;
  }) => React.ReactNode;
  /** Custom cell for the actions column */
  actionsColumnCell?: (props: { row: Row<T>; table: Table<T> }) => React.ReactNode;
  /** Drag-and-drop context component */
  dragContext: ComponentType<SortableContextProps>;
  /** Props for the drag-and-drop context */
  dragContextProps: DragContextProps;
  /** Custom row component for drag-and-drop */
  rowComponent?: ComponentType<RowComponentProps<Row<T>>>;
  /** Function to get the ID for a row */
  getRowId?: (row: Row<T>) => string | number;
}

/**
 * Base component for schema tables
 * Provides common functionality for both BigQuery and Athena schema tables
 */
export function BaseSchemaTable<T extends BaseSchemaField>({
  fields,
  onFieldsChange,
  createNewField,
  renderTypeCell,
  additionalColumns = [],
  fieldsForStatusCount,
  onSearchChange,
  nameColumnHeader,
  nameColumnCell,
  primaryKeyColumnCell,
  actionsColumnCell,
  dragContext,
  dragContextProps,
  rowComponent,
  getRowId,
}: BaseSchemaTableProps<T>) {
  // Handler to update a field
  const updateField = useCallback(
    (index: number, updatedField: Partial<T>) => {
      if (onFieldsChange) {
        const newFields = [...fields];
        newFields[index] = { ...newFields[index], ...updatedField };
        onFieldsChange(newFields);
      }
    },
    [fields, onFieldsChange]
  );

  // Handler to add a new row
  const handleAddRow = useCallback(() => {
    if (onFieldsChange) {
      const newField = createNewField();
      onFieldsChange([...fields, newField]);
    }
  }, [fields, onFieldsChange, createNewField]);

  // Handler to delete a row
  const handleDeleteRow = useCallback(
    (index: number) => {
      if (onFieldsChange) {
        const newFields = [...fields];
        newFields.splice(index, 1);
        onFieldsChange(newFields);
      }
    },
    [fields, onFieldsChange]
  );

  // Define common columns
  const baseColumns = useMemo<ColumnDef<T>[]>(
    () => [
      {
        id: 'dragHandle',
        header: '',
        size: 24,
        enableHiding: false,
      },
      {
        accessorKey: 'status',
        header: '',
        size: 36,
        cell: ({ row }) => <SchemaFieldStatusIcon status={row.getValue('status')} />,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        header:
          nameColumnHeader ??
          (() => (
            <Tooltip>
              <TooltipTrigger className='cursor-default'>Name</TooltipTrigger>
              <TooltipContent>Field name in the output schema</TooltipContent>
            </Tooltip>
          )),
        size: 80,
        cell: ({ row }) => {
          if (nameColumnCell) {
            return nameColumnCell({ row, updateField });
          }
          return (
            <EditableText
              value={asString(row.getValue('name'))}
              onValueChange={value => {
                updateField(row.index, { name: value } as Partial<T>);
              }}
              placeholder={'Field name is required'}
              isBold={true}
            />
          );
        },
        enableHiding: false,
      },
      // Type column is provided by the specific implementation
      {
        accessorKey: 'isPrimaryKey',
        header: () => (
          <Tooltip>
            <TooltipTrigger className='cursor-default'>PK</TooltipTrigger>
            <TooltipContent>
              Is field must be considered as a part of the output Primary Key
            </TooltipContent>
          </Tooltip>
        ),
        size: 36,
        cell: ({ row }) => {
          if (primaryKeyColumnCell) {
            return primaryKeyColumnCell({ row, updateField });
          }
          return (
            <SchemaFieldPrimaryKeyCheckbox
              isPrimaryKey={row.getValue('isPrimaryKey')}
              onPrimaryKeyChange={value => {
                updateField(row.index, { isPrimaryKey: value } as Partial<T>);
              }}
            />
          );
        },
        enableHiding: false,
      },
      {
        accessorKey: 'alias',
        header: () => (
          <Tooltip>
            <TooltipTrigger className='cursor-default'>Alias</TooltipTrigger>
            <TooltipContent>Alternative name for the field</TooltipContent>
          </Tooltip>
        ),
        size: 80,
        cell: ({ row }) => (
          <EditableText
            value={row.getValue('alias')}
            onValueChange={value => {
              updateField(row.index, { alias: value } as Partial<T>);
            }}
            placeholder='-'
          />
        ),
      },
      {
        accessorKey: 'description',
        header: () => (
          <Tooltip>
            <TooltipTrigger className='cursor-default'>Description</TooltipTrigger>
            <TooltipContent>Detailed information about the field</TooltipContent>
          </Tooltip>
        ),
        cell: ({ row }) => (
          <EditableText
            value={row.getValue('description')}
            onValueChange={value => {
              updateField(row.index, { description: value } as Partial<T>);
            }}
            minRows={5}
            placeholder='-'
          />
        ),
      },
      {
        id: 'actions',
        header: ({ table }) => <TableActionsButton table={table} />,
        cell: ({ row, table }) => {
          if (actionsColumnCell) {
            return actionsColumnCell({ row, table });
          }
          return (
            <SchemaFieldActionsButton
              row={row}
              onDeleteRow={onFieldsChange ? handleDeleteRow : undefined}
            />
          );
        },
        size: 40,
        enableResizing: false,
        enableHiding: false,
      },
    ],
    [
      updateField,
      handleDeleteRow,
      onFieldsChange,
      nameColumnHeader,
      nameColumnCell,
      primaryKeyColumnCell,
      actionsColumnCell,
    ]
  );

  // Combine base columns with type column and any additional columns
  const columns = useMemo(() => {
    const typeColumnIndex = 3; // Insert type column after name column
    const typeColumn: ColumnDef<T> = {
      accessorKey: 'type',
      header: () => (
        <Tooltip>
          <TooltipTrigger className='cursor-default pl-[12px]'>Type</TooltipTrigger>
          <TooltipContent>Data type of the field</TooltipContent>
        </Tooltip>
      ),
      size: 80,
      cell: props => renderTypeCell({ row: props.row, updateField }),
      enableHiding: false,
    };

    const result = [...baseColumns];
    result.splice(typeColumnIndex, 0, typeColumn);

    if (additionalColumns.length > 0) {
      const columnsToAdd = [...additionalColumns];

      columnsToAdd.sort((a, b) => {
        const indexA = a.columnIndex ?? Infinity;
        const indexB = b.columnIndex ?? Infinity;
        return indexA - indexB;
      });

      columnsToAdd.forEach(column => {
        if (column.columnIndex !== undefined) {
          const insertIndex = Math.min(Math.max(0, column.columnIndex), result.length);
          result.splice(insertIndex, 0, column as ColumnDef<T>);
        } else {
          result.splice(result.length - 1, 0, column as ColumnDef<T>);
        }
      });
    }

    return result;
  }, [baseColumns, renderTypeCell, updateField, additionalColumns]);

  return (
    <SchemaTable
      fields={fields}
      columns={columns}
      onFieldsChange={onFieldsChange}
      onAddRow={onFieldsChange ? handleAddRow : undefined}
      fieldsForStatusCount={fieldsForStatusCount}
      onSearchChange={onSearchChange}
      dragContext={dragContext}
      dragContextProps={dragContextProps}
      rowComponent={rowComponent}
      getRowId={getRowId}
    />
  );
}
