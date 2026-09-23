import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import { effectiveComparisonType } from '../ReportColumnPicker/output-controls-operators';

/** Top-level field name → the type its filter compares against. */
export type PreviewFilterTypes = ReadonlyMap<string, string>;

/**
 * The preview shows top-level fields only, so only they are mapped. Same type the report column
 * picker filters by: a REPEATED field is an ARRAY<T>, which the backend refuses to filter.
 */
export function previewFilterTypesFromSchema(
  schema: DataMartSchema | null | undefined
): PreviewFilterTypes {
  const types = new Map<string, string>();
  for (const field of schema?.fields ?? []) {
    const mode = 'mode' in field ? field.mode : undefined;
    types.set(field.name, effectiveComparisonType(field.type, mode));
  }
  return types;
}
