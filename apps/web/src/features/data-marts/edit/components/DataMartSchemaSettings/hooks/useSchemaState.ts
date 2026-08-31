import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
  DatabricksSchemaField,
  DataMartSchema,
  RedshiftSchemaField,
  SnowflakeSchemaField,
} from '../../../../shared/types/data-mart-schema.types';
import {
  isAthenaField,
  isAthenaSchema,
  isBigQueryField,
  isBigQuerySchema,
  isDatabricksField,
  isDatabricksSchema,
  isRedshiftField,
  isRedshiftSchema,
  isSnowflakeField,
  isSnowflakeSchema,
} from '../utils';

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

function fingerprint(schema: DataMartSchema | null | undefined): string {
  return JSON.stringify(schema ?? null);
}

/**
 * Custom hook for managing schema state.
 * Extracts state management logic from the DataMartSchemaSettings component.
 *
 * @param initialSchema - The initial schema from the data mart
 * @returns An object containing the schema state and functions to update it
 */
export function useSchemaState(initialSchema: DataMartSchema | null | undefined) {
  const [schema, setSchema] = useState<DataMartSchema | null | undefined>(() =>
    deepCloneSchema(initialSchema)
  );
  const [isDirty, setIsDirty] = useState(false);
  const skipNextInitialSchemaResetRef = useRef(false);
  // Filled on first use rather than passed to `useRef`, whose argument is evaluated on EVERY render
  // and thrown away after the first — and this one serialises the whole schema.
  const appliedInitialSchemaRef = useRef<string | null>(null);
  appliedInitialSchemaRef.current ??= fingerprint(initialSchema);

  // Reset schema when initialSchema changes
  useEffect(() => {
    if (skipNextInitialSchemaResetRef.current) {
      skipNextInitialSchemaResetRef.current = false;
      // Deliberately NOT recorded as applied: what is on screen is the schema this hook was told
      // to keep, not the one just skipped. Recording the skipped one would make it match every
      // later republish, and the server's own version — the level it derived — would never land.
      return;
    }
    const incoming = fingerprint(initialSchema);
    // Compared by CONTENT, not identity. Every refetch of the Data Mart hands this hook a fresh
    // object — the runs poll, an actualization, a relationship change — and resetting on identity
    // alone silently discards whatever the analyst has typed since, while a failed save's errors
    // stay on screen naming a field that is no longer in the table.
    if (incoming === appliedInitialSchemaRef.current) return;
    appliedInitialSchemaRef.current = incoming;
    const clonedSchema = deepCloneSchema(initialSchema);
    setSchema(clonedSchema);
    setIsDirty(false);
  }, [initialSchema]);

  /**
   * Marks the current schema as persisted. The matching context update will
   * provide the same schema as a new initialSchema; skip that reset so changes
   * made by a guarded follow-up action are not overwritten by its effect.
   */
  const markSchemaSaved = useCallback((savedSchema: DataMartSchema) => {
    skipNextInitialSchemaResetRef.current = true;
    // What is on screen from here on, so the next initialSchema that DIFFERS from it still resets
    // — including the server's own copy of this save, which carries the level it derived.
    appliedInitialSchemaRef.current = fingerprint(savedSchema);
    setSchema(deepCloneSchema(savedSchema));
    setIsDirty(false);
  }, []);

  /**
   * Whether the NEXT `initialSchema` the context publishes should leave the live schema alone.
   * Raised while a save is in flight and something is applied on top of it: what comes back
   * describes the snapshot that was SENT, not what is on screen. Nothing about that edit is
   * persisted, so unlike `markSchemaSaved` this changes neither the schema nor `isDirty` — and it
   * is lowered again on a failed save, where no new schema ever arrives to be kept from.
   */
  const keepUnsavedEdits = useCallback((keep: boolean) => {
    skipNextInitialSchemaResetRef.current = keep;
  }, []);

  /**
   * Updates the schema with new fields.
   * Ensures type safety by checking the schema and field types.
   * If schema is null or undefined, creates a new schema based on field types.
   */
  const updateSchema = useCallback(
    (
      newFields:
        | BigQuerySchemaField[]
        | AthenaSchemaField[]
        | SnowflakeSchemaField[]
        | RedshiftSchemaField[]
        | DatabricksSchemaField[]
    ) => {
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
        } else if (isSnowflakeSchema(schema) && newFields.every(isSnowflakeField)) {
          setSchema({
            ...schema,
            fields: newFields,
          });
          setIsDirty(true);
        } else if (isRedshiftSchema(schema) && newFields.every(isRedshiftField)) {
          setSchema({
            ...schema,
            fields: newFields,
          });
          setIsDirty(true);
        } else if (isDatabricksSchema(schema) && newFields.every(isDatabricksField)) {
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
          } else if (isSnowflakeField(newFields[0])) {
            setSchema({
              type: 'snowflake-data-mart-schema',
              fields: newFields as SnowflakeSchemaField[],
            });
            setIsDirty(true);
          } else if (isRedshiftField(newFields[0])) {
            setSchema({
              type: 'redshift-data-mart-schema',
              fields: newFields as RedshiftSchemaField[],
            });
            setIsDirty(true);
          } else if (isDatabricksField(newFields[0])) {
            setSchema({
              type: 'databricks-data-mart-schema',
              fields: newFields as DatabricksSchemaField[],
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
    markSchemaSaved,
    keepUnsavedEdits,
    setIsDirty,
  };
}
