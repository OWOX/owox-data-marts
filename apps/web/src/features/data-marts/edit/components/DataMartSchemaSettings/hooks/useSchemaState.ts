import { useCallback, useEffect, useState } from 'react';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
  DataMartSchema,
} from '../../../../shared/types/data-mart-schema.types';
import { isAthenaField, isAthenaSchema, isBigQueryField, isBigQuerySchema } from '../utils';

/**
 * Helper function to safely deep clone a schema object
 * @param schema - The schema to clone
 * @returns A deep clone of the schema with the same type
 */
function deepCloneSchema<T extends DataMartSchema | null | undefined>(schema: T): T {
  if (schema == null) {
    return schema;
  }
  return JSON.parse(JSON.stringify(schema)) as T;
}

/**
 * Custom hook for managing schema state.
 * Extracts state management logic from the DataMartSchemaSettings component.
 *
 * @param initialSchema - The initial schema from the data mart
 * @returns An object containing the schema state and functions to update it
 */
export function useSchemaState(initialSchema: DataMartSchema | null | undefined) {
  const clonedInitialSchema = deepCloneSchema(initialSchema);
  const [schema, setSchema] = useState<DataMartSchema | null | undefined>(clonedInitialSchema);
  const [isDirty, setIsDirty] = useState(false);

  // Reset schema when initialSchema changes
  useEffect(() => {
    const clonedSchema = deepCloneSchema(initialSchema);
    setSchema(clonedSchema);
    setIsDirty(false);
  }, [initialSchema]);

  /**
   * Updates the schema with new fields.
   * Ensures type safety by checking the schema and field types.
   * If schema is null or undefined, creates a new schema based on field types.
   */
  const updateSchema = useCallback(
    (newFields: BigQuerySchemaField[] | AthenaSchemaField[]) => {
      if (schema) {
        if (isBigQuerySchema(schema) && newFields.every(isBigQueryField)) {
          setSchema({
            ...schema,
            fields: newFields,
          });
          setIsDirty(true);
        } else if (isAthenaSchema(schema) && newFields.every(isAthenaField)) {
          setSchema({
            ...schema,
            fields: newFields,
          });
          setIsDirty(true);
        }
      } else {
        // If schema is null or undefined, create a new schema based on field types
        if (newFields.length > 0) {
          if (isBigQueryField(newFields[0])) {
            setSchema({
              type: 'bigquery-data-mart-schema',
              fields: newFields as BigQuerySchemaField[],
            });
            setIsDirty(true);
          } else if (isAthenaField(newFields[0])) {
            setSchema({
              type: 'athena-data-mart-schema',
              fields: newFields as AthenaSchemaField[],
            });
            setIsDirty(true);
          }
        }
      }
    },
    [schema]
  );

  /**
   * Resets the schema to the initial state.
   * Uses a deep clone to ensure nested fields are properly reset.
   */
  const resetSchema = useCallback(() => {
    const clonedSchema = deepCloneSchema(initialSchema);
    setSchema(clonedSchema);
    setIsDirty(false);
  }, [initialSchema]);

  return {
    schema,
    isDirty,
    updateSchema,
    resetSchema,
    setIsDirty,
  };
}
