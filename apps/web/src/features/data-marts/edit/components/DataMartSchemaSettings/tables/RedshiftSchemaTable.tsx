import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTableRow } from '@owox/ui/components/common/sortable-table-row';
import type { Row } from '@tanstack/react-table';
import { useCallback } from 'react';
import { DataStorageType } from '../../../../../data-storage';
import type { RedshiftSchemaField } from '../../../../shared/types/data-mart-schema.types';
import {
  DataMartSchemaFieldStatus,
  RedshiftFieldType,
} from '../../../../shared/types/data-mart-schema.types';
import { SchemaFieldTypeSelect } from '../components';
import { useDragAndDrop } from '../hooks';
import { BaseSchemaTable } from './BaseSchemaTable';

/**
 * Props for the RedshiftSchemaTable component
 */
interface RedshiftSchemaTableProps {
  /** The fields to display in the table */
  fields: RedshiftSchemaField[];
  /** Callback function to call when the fields change */
  onFieldsChange?: (fields: RedshiftSchemaField[]) => void;
}

/**
 * Component for displaying and editing Redshift schema fields
 */
export function RedshiftSchemaTable({ fields, onFieldsChange }: RedshiftSchemaTableProps) {
  // Function to create a new Redshift field
  const createNewField = useCallback(() => {
    return {
      name: '',
      type: RedshiftFieldType.VARCHAR,
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
      row: Row<RedshiftSchemaField>;
      updateField: (index: number, updatedField: Partial<RedshiftSchemaField>) => void;
    }) => (
      <SchemaFieldTypeSelect
        type={row.getValue('type')}
        storageType={DataStorageType.AWS_REDSHIFT}
        onTypeChange={value => {
          updateField(row.index, { type: value as RedshiftFieldType });
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
