import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import type { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { DataStorageType } from '../../../../../data-storage';
import type { DuckDbSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  DataMartSchemaFieldStatus,
  DuckDbFieldType,
} from '../../../../shared/types/data-mart-schema.types';
import { SchemaFieldTypeSelect } from '../components';
import { useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';
import type { SchemaAiHelper } from '../types/ai-helper';
import type { SchemaToolbar } from '../types/schema-toolbar';

/**
 * Props for the DuckDbSchemaTable component
 */
interface DuckDbSchemaTableProps {
  /** The fields to display in the table */
  fields: DuckDbSchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: DuckDbSchemaField[]) => void;
  /** AI helper handlers; omit to hide AI buttons. */
  aiHelper?: SchemaAiHelper;
  schemaToolbar: SchemaToolbar;
}

/**
 * Component for displaying and editing DuckDB schema fields
 */
export function DuckDbSchemaTable({
  fields,
  onFieldsChange,
  aiHelper,
  schemaToolbar,
}: DuckDbSchemaTableProps) {
  // Function to create a new DuckDB field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: DuckDbFieldType.VARCHAR,
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
      row: Row<DuckDbSchemaField>;
      updateField: (index: number, updatedField: Partial<DuckDbSchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType={DataStorageType.DUCKDB}
        onTypeChange={value => {
          updateField(row.index, { type: value as DuckDbFieldType });
        }}
      />
    ),
    []
  );

  // Use the drag-and-drop hook
  const { handleDragEnd } = useDragAndDrop(fields, onFieldsChange);

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
        fields={fields}
        onFieldsChange={onFieldsChange}
        createNewField={createNewField}
        renderTypeCell={renderTypeCell}
        dragContext={SortableContext}
        dragContextProps={{
          items: fields.map((_, index) => index),
          strategy: verticalListSortingStrategy,
        }}
        rowComponent={SortableTableRow}
        aiHelper={aiHelper}
        schemaToolbar={schemaToolbar}
        storageType={DataStorageType.DUCKDB}
      />
    </DndContext>
  );
}
