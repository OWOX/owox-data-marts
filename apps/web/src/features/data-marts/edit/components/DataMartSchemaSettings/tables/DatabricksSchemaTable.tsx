import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import type { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { DataStorageType } from '../../../../../data-storage';
import type { DatabricksSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  DatabricksFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { SchemaFieldTypeSelect } from '../components';
import { useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';

/**
 * Props for the DatabricksSchemaTable component
 */
interface DatabricksSchemaTableProps {
  /** The fields to display in the table */
  fields: DatabricksSchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: DatabricksSchemaField[]) => void;
}

/**
 * Component for displaying and editing Databricks schema fields
 */
export function DatabricksSchemaTable({ fields, onFieldsChange }: DatabricksSchemaTableProps) {
  // Function to create a new Databricks field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: DatabricksFieldType.STRING,
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
      row: Row<DatabricksSchemaField>;
      updateField: (index: number, updatedField: Partial<DatabricksSchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType={DataStorageType.DATABRICKS}
        onTypeChange={value => {
          updateField(row.index, { type: value as DatabricksFieldType });
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
      />
    </DndContext>
  );
}
