import { useCallback } from 'react';
import {
  BigQueryFieldMode,
  BigQueryFieldType,
  type BigQuerySchemaField,
  DataMartSchemaFieldStatus,
} from '../../../../shared/types/data-mart-schema.types';

/**
 * Custom hook for managing nested field operations in BigQuery schema tables
 *
 * @param fields - The BigQuery schema fields
 * @param flattenedFields - The flattened fields array with path information
 * @param onFieldsChange - Callback function to call when the fields change
 * @param setExpandedRecords - Function to update the expanded records state
 * @returns Object containing functions for updating, adding, and deleting nested fields
 */
export function useNestedFieldOperations(
  fields: BigQuerySchemaField[],
  flattenedFields: (BigQuerySchemaField & { path?: string; level?: number })[],
  onFieldsChange?: (fields: BigQuerySchemaField[]) => void,
  setExpandedRecords?: (updater: (prev: Set<string>) => Set<string>) => void
) {
  // Handler to update a field (both top-level and nested)
  const updateField = useCallback(
    (index: number, updatedField: Partial<BigQuerySchemaField>) => {
      if (onFieldsChange) {
        const newFields = [...fields];

        // Get the path from the flattened field
        const path = flattenedFields[index].path;
        if (!path) {
          // If no path, it's a top-level field
          newFields[index] = { ...newFields[index], ...updatedField };
        } else {
          // Parse the path to find the nested field
          const pathParts = path.split('.').map(Number);
          let currentFields = newFields;
          let currentField;

          // Navigate to the parent of the field to update
          for (let i = 0; i < pathParts.length - 1; i++) {
            currentField = currentFields[pathParts[i]];
            currentFields = currentField.fields ?? [];
          }

          // Update the field
          const lastIndex = pathParts[pathParts.length - 1];
          if (currentFields[lastIndex]) {
            currentFields[lastIndex] = { ...currentFields[lastIndex], ...updatedField };
          }
        }

        onFieldsChange(newFields);
      }
    },
    [fields, flattenedFields, onFieldsChange]
  );

  // Handler to add a new top-level field
  const handleAddRow = useCallback(() => {
    if (onFieldsChange) {
      const newField: BigQuerySchemaField = {
        name: '',
        type: BigQueryFieldType.STRING,
        mode: BigQueryFieldMode.NULLABLE,
        isPrimaryKey: false,
        status: DataMartSchemaFieldStatus.DISCONNECTED,
      };
      onFieldsChange([...fields, newField]);
    }
  }, [fields, onFieldsChange]);

  // Handler to delete a field (both top-level and nested)
  const handleDeleteRow = useCallback(
    (index: number) => {
      if (onFieldsChange) {
        const newFields = [...fields];

        // Get the path from the flattened field
        const path = flattenedFields[index].path;
        if (!path) {
          // If no path, it's a top-level field
          newFields.splice(index, 1);
        } else {
          // Parse the path to find the nested field
          const pathParts = path.split('.').map(Number);
          let currentFields = newFields;
          let currentField;

          // Navigate to the parent of the field to delete
          for (let i = 0; i < pathParts.length - 1; i++) {
            currentField = currentFields[pathParts[i]];
            currentFields = currentField.fields ?? [];
          }

          // Delete the field
          const lastIndex = pathParts[pathParts.length - 1];
          currentFields.splice(lastIndex, 1);
        }

        onFieldsChange(newFields);
      }
    },
    [fields, flattenedFields, onFieldsChange]
  );

  // Handler to add a nested field to a record field
  const handleAddNestedField = useCallback(
    (index: number) => {
      if (onFieldsChange && setExpandedRecords) {
        const newFields = [...fields];

        // Get the path from the flattened field
        const path = flattenedFields[index].path;

        // Create a new nested field
        const newNestedField: BigQuerySchemaField = {
          name: '',
          type: BigQueryFieldType.STRING,
          mode: BigQueryFieldMode.NULLABLE,
          isPrimaryKey: false,
          status: DataMartSchemaFieldStatus.DISCONNECTED,
        };

        if (!path) {
          // If no path, it's a top-level field
          newFields[index].fields ??= [];
          newFields[index].fields.push(newNestedField);
        } else {
          // Parse the path to find the record field
          const pathParts = path.split('.').map(Number);
          let currentField = newFields;

          // Navigate to the field where we want to add a nested field
          for (let i = 0; i < pathParts.length; i++) {
            const idx = pathParts[i];
            if (i === pathParts.length - 1) {
              // We've reached the target field
              currentField[idx].fields ??= [];
              currentField[idx].fields.push(newNestedField);
            } else {
              // Continue navigating
              currentField = currentField[idx].fields ?? [];
            }
          }
        }

        // Ensure the record field is expanded so the new nested field is visible
        setExpandedRecords(prev => {
          const newSet = new Set(prev);
          if (path) {
            newSet.add(path);
          }
          return newSet;
        });

        onFieldsChange(newFields);
      }
    },
    [fields, flattenedFields, onFieldsChange, setExpandedRecords]
  );

  return {
    updateField,
    handleAddRow,
    handleDeleteRow,
    handleAddNestedField,
  };
}
