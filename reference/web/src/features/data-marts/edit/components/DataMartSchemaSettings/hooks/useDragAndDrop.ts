import type { DragEndEvent } from '@dnd-kit/core';
import { useCallback } from 'react';
import type {
  BaseSchemaField,
  BigQuerySchemaField,
} from '../../../../shared/types/data-mart-schema.types';

/**
 * Custom hook for handling drag-and-drop functionality in schema tables
 * Works with both BigQuery (nested fields) and Athena (flat fields) tables
 *
 * @param fields - The schema fields
 * @param onFieldsChange - Callback function to call when the fields change
 * @param flattenedFields - The flattened fields array with path information (for BigQuery)
 * @returns Object containing the handleDragEnd function
 */
export function useDragAndDrop<T extends BaseSchemaField>(
  fields: T[],
  onFieldsChange?: (fields: T[]) => void,
  flattenedFields?: (T & { path?: string; level?: number })[]
) {
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id || !onFieldsChange) return;

      // For Athena (simple case - no nested fields)
      if (!flattenedFields) {
        const activeIndex = Number(active.id);
        const overIndex = Number(over.id);

        const newFields = [...fields];
        const [removed] = newFields.splice(activeIndex, 1);
        newFields.splice(overIndex, 0, removed);

        onFieldsChange(newFields);
        return;
      }

      // For BigQuery (complex case - with nested fields)
      const activeIndex = flattenedFields.findIndex(
        (field, index) => (field.path ?? String(index)) === active.id
      );
      const overIndex = flattenedFields.findIndex(
        (field, index) => (field.path ?? String(index)) === over.id
      );

      if (activeIndex === -1 || overIndex === -1) return;

      const activePath = flattenedFields[activeIndex].path;
      const overPath = flattenedFields[overIndex].path;

      const newFields = [...fields];

      // If both fields are at the top level (no path)
      if (!activePath && !overPath) {
        const [removed] = newFields.splice(activeIndex, 1);
        newFields.splice(overIndex, 0, removed);
        onFieldsChange(newFields);
        return;
      }

      // If both fields have the same parent (same path except last part)
      if (activePath && overPath) {
        const activePathParts = activePath.split('.').map(Number);
        const overPathParts = overPath.split('.').map(Number);

        // Check if they have the same parent
        if (
          activePathParts.length === overPathParts.length &&
          activePathParts.slice(0, -1).join('.') === overPathParts.slice(0, -1).join('.')
        ) {
          // Find the parent field
          let currentFields = newFields as unknown as BigQuerySchemaField[];
          for (let i = 0; i < activePathParts.length - 1; i++) {
            currentFields = currentFields[activePathParts[i]].fields ?? [];
          }

          // Move the field within the parent
          const sourceLastIndex = activePathParts[activePathParts.length - 1];
          const destLastIndex = overPathParts[overPathParts.length - 1];

          const [removed] = currentFields.splice(sourceLastIndex, 1);
          currentFields.splice(destLastIndex, 0, removed);

          onFieldsChange(newFields);
        }
      }
    },
    [fields, flattenedFields, onFieldsChange]
  );

  return { handleDragEnd };
}
