import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import type { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { DataStorageType } from '../../../../../data-storage';
import type { AthenaSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  AthenaFieldType,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';
import { SchemaFieldTypeSelect } from '../components';
import { useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';

/**
 * Props for the AthenaSchemaTable component
 */
interface AthenaSchemaTableProps {
  /** The fields to display in the table */
  fields: AthenaSchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: AthenaSchemaField[]) => void;
}

/**
 * Component for displaying and editing Athena schema fields
 */
export function AthenaSchemaTable({ fields, onFieldsChange }: AthenaSchemaTableProps) {
  // Function to create a new Athena field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: AthenaFieldType.STRING,
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
      row: Row<AthenaSchemaField>;
      updateField: (index: number, updatedField: Partial<AthenaSchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType={DataStorageType.AWS_ATHENA}
        onTypeChange={value => {
          updateField(row.index, { type: value as AthenaFieldType });
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
