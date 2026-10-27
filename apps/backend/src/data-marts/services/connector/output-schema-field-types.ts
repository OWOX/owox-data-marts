import { isCalculatedField } from '../../calculated-fields/calculated-field.utils';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

/**
 * Sources that read the Output Schema types of their Data Mart at run time. Google Sheets has
 * no column types of its own, so the Output Schema is where a user says a column holds dates.
 */
export const SOURCES_READING_OUTPUT_SCHEMA_TYPES: ReadonlySet<string> = new Set(['GoogleSheets']);

/** The run-time parameter that carries the classes, as a JSON object of field name to class. */
export const OUTPUT_SCHEMA_FIELD_TYPES_PARAMETER = 'OutputSchemaFieldTypes';

export type OutputSchemaFieldTypeClass = 'DATE' | 'OTHER';

/**
 * Classifies each warehouse field of an Output Schema as DATE or OTHER.
 *
 * Only DATE is singled out: it is spelled the same in every storage, and the column a source
 * creates for it is DATE everywhere, so the Output Schema and the table agree after a run.
 * Date-time types differ per storage in name and time zone handling, so they stay OTHER.
 *
 * Calculated fields have no warehouse column and disconnected fields no longer have one, so
 * both are left out, as are nested fields: a source writes top-level columns only.
 */
export function classifyOutputSchemaFieldTypes(
  schema: DataMartSchema
): Record<string, OutputSchemaFieldTypeClass> {
  const classes: Record<string, OutputSchemaFieldTypeClass> = {};
  for (const field of schema.fields) {
    if (isCalculatedField(field) || field.status === DataMartSchemaFieldStatus.DISCONNECTED) {
      continue;
    }
    classes[field.name] = String(field.type).trim().toUpperCase() === 'DATE' ? 'DATE' : 'OTHER';
  }
  return classes;
}
