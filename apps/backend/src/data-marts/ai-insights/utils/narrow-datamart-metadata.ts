import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import { QueryPlan } from '../agent/types';
import { GetMetadataOutput } from '../ai-insights-types';

type NarrowableSchemaFieldBase = {
  name: string;
  status?: DataMartSchemaFieldStatus;
  fields?: NarrowableSchemaFieldBase[];
};

function narrowFieldsRec<T extends NarrowableSchemaFieldBase>(
  fields: T[],
  required: Set<string>
): T[] {
  const result: T[] = [];

  for (const field of fields) {
    if (field.status !== undefined && field.status !== DataMartSchemaFieldStatus.CONNECTED) {
      continue;
    }

    const nested = field.fields as T[] | undefined;
    const narrowedNested = Array.isArray(nested) ? narrowFieldsRec(nested, required) : undefined;

    const match =
      required.has(field.name) || (narrowedNested !== undefined && narrowedNested.length > 0);

    if (!match) continue;

    const { status: _omit, ...cleaned } = field as T & { status?: DataMartSchemaFieldStatus };

    result.push({
      ...cleaned,
      ...(narrowedNested ? { fields: narrowedNested } : {}),
    } as T);
  }

  return result;
}

function narrowSchema<S extends { fields: T[] }, T extends NarrowableSchemaFieldBase>(
  schema: S,
  required: Set<string>
): S | undefined {
  const narrowed = narrowFieldsRec<T>(schema.fields, required);
  return narrowed.length ? ({ ...schema, fields: narrowed } as S) : undefined;
}

export function buildNarrowMetadata(
  plan: QueryPlan,
  metadata: GetMetadataOutput | undefined
): GetMetadataOutput | undefined {
  if (!metadata?.schema) return metadata;

  const required = new Set(
    plan.requiredColumns?.length
      ? plan.requiredColumns
      : [...plan.dimensions, ...plan.metrics, ...(plan.dateField ? [plan.dateField] : [])]
  );

  const narrowed = narrowSchema(metadata.schema, required);

  return narrowed ? { ...metadata, schema: narrowed } : metadata;
}
