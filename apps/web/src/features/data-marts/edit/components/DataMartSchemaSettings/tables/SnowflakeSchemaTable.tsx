import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import type { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { DataStorageType } from '../../../../../data-storage';
import type { SnowflakeSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  SnowflakeFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { SchemaFieldTypeSelect } from '../components';
import { useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';

/**
 * Props for the SnowflakeSchemaTable component
 */
interface SnowflakeSchemaTableProps {
  /** The fields to display in the table */
  fields: SnowflakeSchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: SnowflakeSchemaField[]) => void;
}

/**
 * Component for displaying and editing Snowflake schema fields
 */
export function SnowflakeSchemaTable({ fields, onFieldsChange }: SnowflakeSchemaTableProps) {
  // Function to create a new Snowflake field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: SnowflakeFieldType.VARCHAR,
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
      row: Row<SnowflakeSchemaField>;
      updateField: (index: number, updatedField: Partial<SnowflakeSchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType={DataStorageType.SNOWFLAKE}
        onTypeChange={value => {
          updateField(row.index, { type: value as SnowflakeFieldType });
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
