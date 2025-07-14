import { useMemo } from 'react';
import { DataStorageType } from '../../../../data-storage';
import type {
  AthenaSchemaField,
  BigQuerySchemaField,
  DataMartSchema,
} from '../../../shared/types/data-mart-schema.types';
import { AthenaSchemaTable, BigQuerySchemaTable } from './tables';
import { createInitialSchema, isAthenaSchema, isBigQuerySchema } from './utils';

/**
 * Props for the SchemaContent component
 */
interface SchemaContentProps {
  /** The schema to display, or null/undefined if no schema exists yet */
  schema: DataMartSchema | null | undefined;
  /** The storage type of the data mart */
  storageType: DataStorageType;
  /** Callback function to call when the fields change */
  onFieldsChange: (fields: BigQuerySchemaField[] | AthenaSchemaField[]) => void;
}

/**
 * Component that renders the appropriate schema table based on the schema type
 * Handles the conditional rendering logic that was previously in the DataMartSchemaSettings component
 */
export function SchemaContent({ schema, storageType, onFieldsChange }: SchemaContentProps) {
  // If schema doesn't exist, create an initial schema based on storage type
  const initialSchema = useMemo(() => {
    if (!schema) {
      const newSchema = createInitialSchema(storageType);
      // Call onFieldsChange with the initial schema's fields to update parent state
      onFieldsChange(newSchema.fields);
      return newSchema;
    }
    return schema;
  }, [schema, storageType, onFieldsChange]);

  // Render the appropriate table based on schema type
  if (isBigQuerySchema(initialSchema)) {
    return <BigQuerySchemaTable fields={initialSchema.fields} onFieldsChange={onFieldsChange} />;
  } else if (isAthenaSchema(initialSchema)) {
    return <AthenaSchemaTable fields={initialSchema.fields} onFieldsChange={onFieldsChange} />;
  }

  // Fallback for unsupported schema types
  return (
    <div className='p-4 text-center'>
      <p>Unsupported schema type</p>
    </div>
  );
}
