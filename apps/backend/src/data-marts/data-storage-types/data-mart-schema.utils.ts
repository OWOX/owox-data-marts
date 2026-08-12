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

// The MAIN Data Mart's `COUNT(DISTINCT …)` key, as `{ name (dotted path), type, field }`. Callers
// read `.name` (the column reference) and `.length`.
//
// HIDDEN components are KEPT. `isHiddenForReporting` takes a column off the reporting menu; it does
// not remove it from the source, and counting is not projecting. Both query paths can reach it: the
// flat one reads the source table directly, and the blended builder already adds the key columns to
// the main CTE's projection for exactly this metric.
//
// DISCONNECTED is all-or-nothing. Such a column really is gone, and counting by the REST of a
// composite key merges rows the key itself keeps distinct — a silent undercount, which is worse
// than withholding the metric.
//
// NESTED components stay, with their full `parent.child` path, so the reference targets the right
// column. That is where this rule differs from `collectPrimaryKeyRowIdentity`, which answers the
// fan-out row-identity question instead and rejects a nested key outright.
export function getMainUniqueCountKeyFields(
  fields: readonly DataMartSchemaField[]
): { name: string; type: string; field: DataMartSchemaField }[] {
  const result: { name: string; type: string; field: DataMartSchemaField }[] = [];
  let complete = true;

  const walk = (nodes: readonly DataMartSchemaField[], prefix: string, reachable: boolean) => {
    for (const field of nodes) {
      const fullName = prefix ? `${prefix}.${field.name}` : field.name;
      const isReachable = reachable && isConnected(field);
      if (field.isPrimaryKey) {
        if (isReachable) result.push({ name: fullName, type: String(field.type), field });
        else complete = false;
      }
      if ('fields' in field && field.fields?.length) {
        walk(field.fields as DataMartSchemaField[], fullName, isReachable);
      }
    }
  };
  walk(fields, '', true);

  return complete ? result : [];
}

// WHETHER this tuple is a valid row identity for de-duplicating fan-out — every component or none,
// since de-duplicating by PART of a composite key merges rows the key itself keeps distinct. Unlike
// getMainUniqueCountKeyFields, a hidden component still counts (hidden means off the reporting
// menu, not absent from the source) and a nested one disqualifies the whole key.
export function collectPrimaryKeyRowIdentity(fields: readonly DataMartSchemaField[]): string[] {
  const columns: string[] = [];
  let complete = true;

  const walk = (nodes: readonly DataMartSchemaField[], prefix: string, reachable: boolean) => {
    for (const field of nodes) {
      const fullName = prefix ? `${prefix}.${field.name}` : field.name;
      const isReachable = reachable && isConnected(field);
      if (field.isPrimaryKey) {
        if (isReachable && !fullName.includes('.')) columns.push(fullName);
        else complete = false;
      }
      if ('fields' in field && field.fields?.length) {
        walk(field.fields as DataMartSchemaField[], fullName, isReachable);
      }
    }
  };
  walk(fields, '', true);

  return complete ? columns : [];
}

// Verdicts for a JOINED source only, i.e. the `collectPrimaryKeyRowIdentity` rule. The MAIN Data
// Mart is governed by `getMainUniqueCountKeyFields` instead and can never be told
// `nested-primary-key`, so it has its own vocabulary (web: MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES)
// rather than borrowing this one.
export const JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES = [
  'available',
  'no-primary-key',
  'disconnected-primary-key',
  'nested-primary-key',
  'nested-and-disconnected-primary-key',
] as const;
export type JoinedUniqueCountAvailability =
  (typeof JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES)[number];

// Every isPrimaryKey field anywhere in the RAW tree, with the two facts that can disqualify it: its
// dotted path (nested when it holds a dot) and whether it AND every ancestor are still connected.
// Status is not pruned — unlike collectSchemaFieldPathDescriptors, which drops those subtrees and so
// would make a declared-but-unreachable key silently disappear (reported as "no key" instead of
// "key exists but broken"). Reachability is computed exactly as collectPrimaryKeyRowIdentity walks
// it, so the diagnosis can never disagree with the predicate it explains.
function collectDeclaredPrimaryKeys(
  fields: readonly DataMartSchemaField[],
  prefix = '',
  reachable = true
): { path: string; reachable: boolean }[] {
  const result: { path: string; reachable: boolean }[] = [];
  for (const field of fields) {
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    const isReachable = reachable && isConnected(field);
    if (field.isPrimaryKey) result.push({ path: fullName, reachable: isReachable });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectDeclaredPrimaryKeys(field.fields as DataMartSchemaField[], fullName, isReachable)
      );
    }
  }
  return result;
}

// Diagnoses WHY the Unique Count metric is/isn't offered for a joined source. `available` tracks
// collectPrimaryKeyRowIdentity exactly, since that is the predicate the query path uses to decide
// whether the metric survives; the other values explain an empty result to the picker.
// Never call this for the MAIN Data Mart — it answers the fan-out row-identity question, not the
// projectable-key one, and disagrees on hidden and nested keys.
//
// A key can fail BOTH ways at once — a nested component beside a disconnected one, or one component
// that is both. Naming only the nested cause sent the user to fix that, after which the metric was
// still withheld for the other reason with no warning that it would be.
export function classifyJoinedUniqueCountAvailability(
  fields: readonly DataMartSchemaField[]
): JoinedUniqueCountAvailability {
  if (collectPrimaryKeyRowIdentity(fields).length > 0) return 'available';
  const declared = collectDeclaredPrimaryKeys(fields);
  if (declared.length === 0) return 'no-primary-key';
  const nested = declared.some(d => d.path.includes('.'));
  const disconnected = declared.some(d => !d.reachable);
  if (nested && disconnected) return 'nested-and-disconnected-primary-key';
  if (nested) return 'nested-primary-key';
  return 'disconnected-primary-key';
}

// TRUE when the schema has at least one primary-key field usable as a dedup/join key — i.e.
// `isPrimaryKey` and NOT DISCONNECTED. Unlike `getMainUniqueCountKeyFields` (which ALSO prunes
// `isHiddenForReporting` for the reporting-view projection), a hidden PK still keys the join,
// so it counts here. Descends into nested fields but never into a DISCONNECTED subtree.
export function hasUsablePrimaryKey(fields: readonly DataMartSchemaField[]): boolean {
  for (const field of fields) {
    if (!isConnected(field)) continue;
    if (field.isPrimaryKey) return true;
    if ('fields' in field && field.fields?.length && hasUsablePrimaryKey(field.fields)) {
      return true;
    }
  }
  return false;
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
