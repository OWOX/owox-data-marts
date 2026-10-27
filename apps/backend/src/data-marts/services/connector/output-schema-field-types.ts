import { Connectors } from '@owox/connectors';
import { isCalculatedField } from '../../calculated-fields/calculated-field.utils';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import type { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

/** The run-time parameter that carries the Output Schema type classes to a source. */
export const OUTPUT_SCHEMA_FIELD_TYPES_PARAMETER = 'OutputSchemaFieldTypes';

export type OutputSchemaFieldTypeClass = 'DATE' | 'OTHER';

/** What a source is told about the Output Schema of the Data Mart it imports into. */
export interface OutputSchemaRunContext {
  /** The Data Mart's Output Schema, or null before it has one. */
  schema: DataMartSchema | null;
  /**
   * Whether an earlier connector run of this Data Mart succeeded. Without an Output Schema, that
   * means the table exists all the same, so its columns must keep the types they have.
   */
  hasImportedBefore: boolean;
}

/**
 * Whether a bundled source asks for the Output Schema types of its Data Mart. A source opts in
 * with a static `readsOutputSchemaFieldTypes` flag; custom connectors never do.
 */
export function sourceReadsOutputSchemaFieldTypes(sourceName: string): boolean {
  const connectorModules = Connectors as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;
  const SourceClass = connectorModules?.[sourceName]?.[`${sourceName}Source`] as
    | { readsOutputSchemaFieldTypes?: unknown }
    | undefined;
  return SourceClass?.readsOutputSchemaFieldTypes === true;
}

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

/**
 * The OutputSchemaFieldTypes value for a run: the field classes, and whether columns the
 * Output Schema does not list are inferred ("INFER") or imported as they are ("KEEP").
 *
 * Undefined for a Data Mart that has neither an Output Schema nor a successful import: it is
 * new, so every column is inferred.
 */
export function buildOutputSchemaFieldTypesValue({
  schema,
  hasImportedBefore,
}: OutputSchemaRunContext): string | undefined {
  if (schema) {
    return JSON.stringify({
      fields: classifyOutputSchemaFieldTypes(schema),
      unlistedColumns: 'INFER',
    });
  }
  return hasImportedBefore ? JSON.stringify({ fields: {}, unlistedColumns: 'KEEP' }) : undefined;
}
