import { z } from 'zod';
import { DataStorageCredentials } from './data-storage-credentials.type';
import { REPORT_AGGREGATE_FUNCTIONS } from '../dto/schemas/aggregate-function.schema';
import type { DataMartSchemaField } from './data-mart-schema.type';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import { DataStorageType } from './enums/data-storage-type.enum';
import { Injectable } from '@nestjs/common';
import { DataStoragePublicCredentialsFactory } from './factories/data-storage-public-credentials.factory';
import { DataStorageCredentialsPublic } from '../dto/presentation/data-storage-response-api.dto';

/**
 * A field is "connected" when it still exists in the data source — i.e. its status is not
 * DISCONNECTED (CONNECTED and CONNECTED_WITH_DEFINITION_MISMATCH both mean the column is
 * present). Keeping this in one place means a future status that also signals "gone from
 * the source" only needs handling here.
 */
export function isConnected(field: DataMartSchemaField): boolean {
  return field.status !== DataMartSchemaFieldStatus.DISCONNECTED;
}

// A hidden-for-reporting or DISCONNECTED node prunes its whole subtree; container
// nodes count as referenceable paths alongside their nested `a.b` leaves.
export function collectSchemaFieldPaths(
  fields: readonly DataMartSchemaField[],
  prefix = ''
): string[] {
  return collectSchemaFieldPathTypes(fields, prefix).map(field => field.name);
}

export function collectSchemaFieldPathTypes(
  fields: readonly DataMartSchemaField[],
  prefix = ''
): { name: string; type: string }[] {
  return collectSchemaFieldPathDescriptors(fields, prefix).map(({ name, type }) => ({
    name,
    type,
  }));
}

// Same traversal as `collectSchemaFieldPathTypes` but exposes the underlying field so
// callers can read per-field governance (aggregationRole / allowedAggregations).
export function collectSchemaFieldPathDescriptors(
  fields: readonly DataMartSchemaField[],
  prefix = ''
): { name: string; type: string; field: DataMartSchemaField }[] {
  const result: { name: string; type: string; field: DataMartSchemaField }[] = [];
  for (const field of fields) {
    if (field.isHiddenForReporting) continue;
    if (!isConnected(field)) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({ name: fullName, type: String(field.type), field });
    if ('fields' in field && field.fields?.length) {
      result.push(...collectSchemaFieldPathDescriptors(field.fields, fullName));
    }
  }
  return result;
}

// Primary-key fields as `{ name (dotted path), type, field }`, reusing the SAME pruned
// traversal as collectSchemaFieldPathDescriptors. This matters because the result feeds
// `primaryKeyColumns` for `COUNT(DISTINCT …)`: a disconnected/hidden PK is dropped (so it
// can't reference a column the query no longer projects) and a NESTED PK keeps its full
// `parent.child` path (so the reference targets the right column, not just the leaf name).
// Callers read `.name` (the column reference) and `.length`.
export function getPrimaryKeyFields(
  fields: readonly DataMartSchemaField[]
): { name: string; type: string; field: DataMartSchemaField }[] {
  return collectSchemaFieldPathDescriptors(fields).filter(d => d.field.isPrimaryKey);
}

export function createBaseFieldSchemaForType<T extends z.ZodTypeAny>(schemaFieldType: T) {
  const typedSchema = z
    .object({
      name: z.string().min(1, 'Case sensitive field name is required'),
      type: schemaFieldType,
      alias: z.string().optional().describe('Field alias for output'),
      description: z.string().optional().describe('Field description'),
      isPrimaryKey: z
        .boolean()
        .default(false)
        .describe('Is field must be a part of a data mart primary key'),
      isHiddenForReporting: z
        .boolean()
        .default(false)
        .describe('Hide field from reporting and blending'),
      aggregationRole: z
        .enum(['dimension', 'metric'])
        .optional()
        .describe('Whether this field acts as a grouping dimension or an aggregatable metric'),
      allowedAggregations: z
        .array(z.enum(REPORT_AGGREGATE_FUNCTIONS))
        .optional()
        .describe(
          'Aggregation functions a report may apply to this field; absent = derive defaults by type'
        ),
      status: z
        .nativeEnum(DataMartSchemaFieldStatus)
        .describe('Field status relatively to the actual data mart schema'),
    })
    .describe('Data mart schema field definition');
  return typedSchema;
}

@Injectable()
export class DataStorageCredentialsUtils {
  constructor(private readonly factory: DataStoragePublicCredentialsFactory) {}

  getPublicCredentials(
    type: DataStorageType,
    credentials: DataStorageCredentials | undefined
  ): DataStorageCredentialsPublic | undefined {
    if (!credentials) return undefined;

    return this.factory.create(type, credentials);
  }
}
