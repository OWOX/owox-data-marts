import { isCalculatedField } from '../../calculated-fields/calculated-field.utils';
import { DATE_TYPES } from '../../dto/schemas/field-type-category';
import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

/**
 * Sources that read the Output Schema types of their Data Mart at run time. Google Sheets has
 * no column types of its own, so the Output Schema is where a user says a column holds dates.
 */
export const SOURCES_READING_OUTPUT_SCHEMA_TYPES: ReadonlySet<string> = new Set(['GoogleSheets']);

/** The run-time parameter that carries the classes, as a JSON object of field name to class. */
export const OUTPUT_SCHEMA_FIELD_TYPES_PARAMETER = 'OutputSchemaFieldTypes';

export type OutputSchemaFieldTypeClass = 'DATE' | 'DATETIME' | 'OTHER';

/**
 * Classifies each warehouse field of an Output Schema as DATE, DATETIME (a date with a time of
 * day, whatever the storage calls it) or OTHER.
 *
 * Calculated fields have no warehouse column, so the source never writes them and they are
 * left out. Nested fields are left out too: a source writes top-level columns only.
 */
export function classifyOutputSchemaFieldTypes(
  schema: DataMartSchema
): Record<string, OutputSchemaFieldTypeClass> {
  const classes: Record<string, OutputSchemaFieldTypeClass> = {};
  for (const field of schema.fields) {
    if (isCalculatedField(field)) continue;
    classes[field.name] = classifyFieldType(field.type);
  }
  return classes;
}

function classifyFieldType(fieldType: unknown): OutputSchemaFieldTypeClass {
  const normalized = String(fieldType).trim().toUpperCase();
  if (normalized === 'DATE') return 'DATE';
  // DATE_TYPES lists the date-time spellings the five storages share; Snowflake adds
  // TIMESTAMP_LTZ and TIMESTAMP_TZ, which the prefix covers.
  if (DATE_TYPES.has(normalized) || normalized.startsWith('TIMESTAMP')) return 'DATETIME';
  return 'OTHER';
}
