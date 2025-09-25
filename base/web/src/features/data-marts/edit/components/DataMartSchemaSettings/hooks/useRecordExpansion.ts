import { useCallback, useMemo, useRef, useState } from 'react';
import {
  BigQueryFieldType,
  type BigQuerySchemaField,
} from '../../../../shared/types/data-mart-schema.types';
import { findMatchingFieldPaths } from './useTableFilter';

/**
 * Custom hook for managing record field expansion in BigQuery schema tables
 *
 * @param fields - The BigQuery schema fields
 * @returns Object containing expansion state and functions to manage it
 */
export function useRecordExpansion(fields: BigQuerySchemaField[]) {
  // State to track which record fields are expanded
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());

  // Keep track of the original expanded state before search
  const [originalExpandedRecords, setOriginalExpandedRecords] = useState<Set<string> | null>(null);

  // Use ref to track previous search value to prevent infinite loops
  const prevSearchValueRef = useRef<string>('');

  // Check if there are any record fields in the schema
  const hasRecordFields = useMemo(() => {
    const checkForRecordFields = (fieldsToCheck: BigQuerySchemaField[]): boolean => {
      return fieldsToCheck.some(field => {
        const isRecord =
          field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;
        return isRecord || (field.fields && checkForRecordFields(field.fields));
      });
    };

    return checkForRecordFields(fields);
  }, [fields]);

  // Toggle expanded state for a record field
  const toggleRecordExpansion = useCallback((fieldPath: string) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldPath)) {
        newSet.delete(fieldPath);
      } else {
        newSet.add(fieldPath);
      }
      return newSet;
    });
  }, []);

  // Toggle all record fields expansion
  const toggleAllRecords = useCallback(() => {
    // Find all record fields with nested fields
    const recordPaths: string[] = [];

    const findRecordPaths = (fieldsToCheck: BigQuerySchemaField[], parentPath = '') => {
      fieldsToCheck.forEach((field, index) => {
        const currentPath = parentPath ? `${parentPath}.${String(index)}` : String(index);
        const isRecord =
          field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;

        if (isRecord && field.fields && field.fields.length > 0) {
          recordPaths.push(currentPath);
          // Also check nested record fields
          findRecordPaths(field.fields, currentPath);
        }
      });
    };

    findRecordPaths(fields);

    setExpandedRecords(prev => {
      // If all record fields are expanded, collapse all
      // Otherwise, expand all
      const allExpanded = recordPaths.every(path => prev.has(path));

      if (allExpanded) {
        // Collapse all
        return new Set();
      } else {
        // Expand all
        return new Set(recordPaths);
      }
    });
  }, [fields]);

  // Flatten fields array to include nested fields when their parent record is expanded
  const flattenedFields = useMemo(() => {
    const result: (BigQuerySchemaField & { path?: string; level?: number })[] = [];

    const processFields = (fieldsToProcess: BigQuerySchemaField[], parentPath = '', level = 0) => {
      fieldsToProcess.forEach((field, index) => {
        const currentPath = parentPath ? `${parentPath}.${String(index)}` : String(index);
        const isRecord =
          field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;

        // Add the field to the result array with its path and level
        result.push({ ...field, path: currentPath, level });

        // If the field is a record type and it's expanded, process its nested fields
        if (isRecord && field.fields && expandedRecords.has(currentPath)) {
          processFields(field.fields, currentPath, level + 1);
        }
      });
    };

    processFields(fields);
    return result;
  }, [fields, expandedRecords]);

  // Handle search value changes
  const handleSearchChange = useCallback(
    (searchValue: string) => {
      // Only process if the search value has actually changed
      if (searchValue === prevSearchValueRef.current) {
        return;
      }

      // Update the previous search value ref
      prevSearchValueRef.current = searchValue;

      if (searchValue) {
        // If this is the first search, save the current expanded state
        if (originalExpandedRecords === null) {
          setOriginalExpandedRecords(new Set(expandedRecords));
        }

        // Find all paths that match the search criteria
        const matchingPaths = findMatchingFieldPaths(fields, searchValue);

        // Extract parent paths that need to be expanded
        const parentPaths = matchingPaths.filter(path => {
          // Check if this is a record field with child fields
          const pathParts = path.split('.').map(Number);
          let currentFields = fields;
          let currentField;

          for (let i = 0; i < pathParts.length; i++) {
            currentField = currentFields[pathParts[i]];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!currentField) return false;

            const isRecord =
              currentField.type === BigQueryFieldType.RECORD ||
              currentField.type === BigQueryFieldType.STRUCT;

            if (isRecord && currentField.fields && currentField.fields.length > 0) {
              // This is a record field with child fields
              return true;
            }

            if (i < pathParts.length - 1) {
              currentFields = currentField.fields ?? [];
            }
          }

          return false;
        });

        // Expand all parent paths
        setExpandedRecords(prev => {
          const newSet = new Set(prev);
          parentPaths.forEach(path => {
            newSet.add(path);
          });
          return newSet;
        });
      } else if (originalExpandedRecords !== null) {
        // If search is cleared, restore the original expanded state
        setExpandedRecords(originalExpandedRecords);
        setOriginalExpandedRecords(null);
      }
    },
    [fields, expandedRecords, originalExpandedRecords]
  );

  // Check if a field is a record type
  const isRecordType = useCallback(
    (index: number) => {
      const field = flattenedFields[index];
      return field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;
    },
    [flattenedFields]
  );

  // Extract top-level fields for status counting
  const topLevelFields = useMemo(() => {
    return fields.map(field => ({
      ...field,
      // Ensure we don't pass nested fields to avoid them being counted in statusCounts
      fields: undefined,
    }));
  }, [fields]);

  // Determine if all record fields are expanded
  const allExpanded = useMemo(() => {
    // Find all record fields with nested fields
    const recordPaths: string[] = [];

    const findRecordPaths = (fieldsToCheck: BigQuerySchemaField[], parentPath = '') => {
      fieldsToCheck.forEach((field, index) => {
        const currentPath = parentPath ? `${parentPath}.${String(index)}` : String(index);
        const isRecord =
          field.type === BigQueryFieldType.RECORD || field.type === BigQueryFieldType.STRUCT;

        if (isRecord && field.fields && field.fields.length > 0) {
          recordPaths.push(currentPath);
          // Also check nested record fields
          findRecordPaths(field.fields, currentPath);
        }
      });
    };

    findRecordPaths(fields);

    // If there are no record fields, consider all expanded as false
    if (recordPaths.length === 0) {
      return false;
    }

    // Check if all record fields are expanded
    return recordPaths.every(path => expandedRecords.has(path));
  }, [fields, expandedRecords]);

  return {
    expandedRecords,
    hasRecordFields,
    toggleRecordExpansion,
    toggleAllRecords,
    flattenedFields,
    handleSearchChange,
    isRecordType,
    topLevelFields,
    allExpanded,
  };
}
