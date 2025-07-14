import { Tooltip, TooltipContent, TooltipTrigger } from '@owox/ui/components/tooltip';
import type { Row, Table } from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import type { BigQuerySchemaField } from '../../../../shared/types/data-mart-schema.types';
import type { ExtendedColumnDef } from './BaseSchemaTable';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import {
  SchemaFieldActionsButton,
  SchemaFieldEditableText,
  SchemaFieldExpandAllButton,
  SchemaFieldExpandButton,
  SchemaFieldModeSelect,
  SchemaFieldPrimaryKeyCheckbox,
  SchemaFieldTypeSelect,
  SortableTableRow,
} from '../components';
import { useNestedFieldOperations, useRecordExpansion, useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

/**
 * Props for the BigQuerySchemaTable component
 */
interface BigQuerySchemaTableProps {
  /** The fields to display in the table */
  fields: BigQuerySchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: BigQuerySchemaField[]) => void;
}

/**
 * Component for displaying and editing BigQuery schema fields
 * Handles nested record fields with expand/collapse functionality
 */
export function BigQuerySchemaTable({ fields, onFieldsChange }: BigQuerySchemaTableProps) {
  // Use the record expansion hook to manage expanded/collapsed state
  const {
    expandedRecords,
    hasRecordFields,
    toggleRecordExpansion,
    toggleAllRecords,
    flattenedFields,
    handleSearchChange,
    isRecordType,
    topLevelFields,
    allExpanded,
  } = useRecordExpansion(fields);

  // Use the nested field operations hook to manage field operations
  const { updateField, handleDeleteRow, handleAddNestedField } = useNestedFieldOperations(
    fields,
    flattenedFields,
    onFieldsChange,
    setExpandedRecords => setExpandedRecords
  );

  // Function to create a new BigQuery field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: BigQueryFieldType.STRING,
      mode: BigQueryFieldMode.NULLABLE,
      isPrimaryKey: false,
      status: DataMartSchemaFieldStatus.DISCONNECTED,
    };
  }, []);

  // Function to render the type cell
  const renderTypeCell = useCallback(
    ({
      row,
      updateField,
    }: {
      row: Row<BigQuerySchemaField>;
      updateField: (index: number, updatedField: Partial<BigQuerySchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType='bigquery'
        onTypeChange={value => {
          updateField(row.index, { type: value as BigQueryFieldType });
        }}
      />
    ),
    []
  );

  // Define additional columns specific to BigQuery
  const additionalColumns = useMemo<ExtendedColumnDef<BigQuerySchemaField>[]>(
    () => [
      {
        accessorKey: 'mode',
        header: () => (
          <Tooltip>
            <TooltipTrigger className='cursor-default pl-[12px]'>Mode</TooltipTrigger>
            <TooltipContent style={{ whiteSpace: 'pre' }}>
              {`BigQuery Field mode:\nNULLABLE - field can be NULL\nREQUIRED - field cant be NULL\nREPEATED - field is an Array of Type`}
            </TooltipContent>
          </Tooltip>
        ),
        size: 80,
        cell: ({ row }: { row: Row<BigQuerySchemaField> }) => (
          <SchemaFieldModeSelect
            mode={row.getValue('mode')}
            onModeChange={value => {
              updateField(row.index, { mode: value });
            }}
          />
        ),
        columnIndex: 4,
      },
    ],
    [updateField]
  );

  // Custom name column header with expand all button
  const nameColumnHeader = useCallback(
    () => (
      <div className='flex items-center'>
        {hasRecordFields && (
          <SchemaFieldExpandAllButton isAllExpanded={allExpanded} onToggle={toggleAllRecords} />
        )}
        <Tooltip>
          <TooltipTrigger className='cursor-default'>Name</TooltipTrigger>
          <TooltipContent>Field name in the output schema</TooltipContent>
        </Tooltip>
      </div>
    ),
    [hasRecordFields, allExpanded, toggleAllRecords]
  );

  // Custom name column cell with indentation and expand button
  const nameColumnCell = useCallback(
    ({
      row,
      updateField,
    }: {
      row: Row<BigQuerySchemaField>;
      updateField: (index: number, updatedField: Partial<BigQuerySchemaField>) => void;
    }) => {
      const field = flattenedFields[row.index];
      const isRecord =
        field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;
      const hasNestedFields = isRecord && field.fields && field.fields.length > 0;
      const path = field.path ?? '';
      const level = field.level ?? 0;
      const isExpanded = expandedRecords.has(path);

      return (
        <div className='flex items-center'>
          {/* Add indentation based on level */}
          {level > 0 && (
            <div
              style={{ width: `${String(level * 16 - (hasNestedFields ? 4 : 0))}px` }}
              className='flex-shrink-0'
            />
          )}

          {/* Show expand button only for record fields with nested fields */}
          {hasNestedFields ? (
            <SchemaFieldExpandButton
              isExpanded={isExpanded}
              onToggle={() => {
                toggleRecordExpansion(path);
              }}
            />
          ) : (
            // Only add placeholder if there are record fields in the schema
            hasRecordFields && <div className='w-5' /> // Placeholder for alignment
          )}

          <SchemaFieldEditableText
            value={row.getValue('name')}
            onValueChange={value => {
              updateField(row.index, { name: value });
            }}
            placeholder={'Field name is required'}
            isBold={true}
          />
        </div>
      );
    },
    [flattenedFields, expandedRecords, hasRecordFields, toggleRecordExpansion]
  );

  // Custom primary key column cell that only shows checkbox for top-level non-record fields
  const primaryKeyColumnCell = useCallback(
    ({
      row,
      updateField,
    }: {
      row: Row<BigQuerySchemaField>;
      updateField: (index: number, updatedField: Partial<BigQuerySchemaField>) => void;
    }) => {
      const field = flattenedFields[row.index];
      const isRecord =
        field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;
      const level = field.level ?? 0;

      // Only show checkbox for top-level fields (level === 0) that are not record types
      if (level === 0 && !isRecord) {
        return (
          <SchemaFieldPrimaryKeyCheckbox
            isPrimaryKey={row.getValue('isPrimaryKey')}
            onPrimaryKeyChange={value => {
              updateField(row.index, { isPrimaryKey: value });
            }}
          />
        );
      }

      // Return empty div for non-top-level fields or record types
      return <div />;
    },
    [flattenedFields]
  );

  // Custom actions column cell with add nested field option for record types
  const actionsColumnCell = useCallback(
    ({ row }: { row: Row<BigQuerySchemaField>; table: Table<BigQuerySchemaField> }) => (
      <SchemaFieldActionsButton
        row={row}
        onDeleteRow={onFieldsChange ? handleDeleteRow : undefined}
        onAddNestedField={onFieldsChange ? handleAddNestedField : undefined}
        isRecordType={isRecordType}
      />
    ),
    [onFieldsChange, handleDeleteRow, handleAddNestedField, isRecordType]
  );

  // Use the drag-and-drop hook
  const { handleDragEnd } = useDragAndDrop(fields, onFieldsChange, flattenedFields);

  // Function to get the ID for a row (path or index in flattenedFields)
  const getRowId = useCallback(
    (row: Row<BigQuerySchemaField>) => {
      const field = flattenedFields[row.index];
      return field.path ?? String(flattenedFields.indexOf(field));
    },
    [flattenedFields]
  );

  // Configure sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Minimum distance in pixels before activating
      },
    })
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <BaseSchemaTable
        fields={flattenedFields}
        onFieldsChange={onFieldsChange}
        createNewField={createNewField}
        renderTypeCell={renderTypeCell}
        additionalColumns={additionalColumns}
        fieldsForStatusCount={topLevelFields}
        onSearchChange={handleSearchChange}
        nameColumnHeader={nameColumnHeader}
        nameColumnCell={nameColumnCell}
        primaryKeyColumnCell={primaryKeyColumnCell}
        actionsColumnCell={actionsColumnCell}
        DragContext={SortableContext}
        dragContextProps={{
          items: flattenedFields.map(f => f.path ?? String(flattenedFields.indexOf(f))),
          strategy: verticalListSortingStrategy,
        }}
        RowComponent={SortableTableRow}
        getRowId={getRowId}
      />
    </DndContext>
  );
}
