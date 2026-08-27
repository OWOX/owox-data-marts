import { z } from 'zod';
import { DataStorageCredentials } from './data-storage-credentials.type';
import { REPORT_AGGREGATE_FUNCTIONS } from '../dto/schemas/aggregate-function.schema';
import type { DataMartSchemaField } from './data-mart-schema.type';
import { BigQueryFieldMode } from './bigquery/enums/bigquery-field-mode.enum';
import { DataMartSchemaFieldStatus } from './enums/data-mart-schema-field-status.enum';
import { DataStorageType } from './enums/data-storage-type.enum';
import { Injectable } from '@nestjs/common';
import { DataStoragePublicCredentialsFactory } from './factories/data-storage-public-credentials.factory';
import { DataStorageCredentialsPublic } from '../dto/presentation/data-storage-response-api.dto';
import { isCalculatedField } from '../calculated-fields/calculated-field.utils';
import { CALCULATED_FIELD_LEVELS } from '../calculated-fields/formula-level';

/**
 * A field is "connected" when it still exists in the data source — i.e. its status is not
 * DISCONNECTED (CONNECTED and CONNECTED_WITH_DEFINITION_MISMATCH both mean the column is
 * present). Keeping this in one place means a future status that also signals "gone from
 * the source" only needs handling here.
 */
export function isConnected(field: DataMartSchemaField): boolean {
  // A calculated field is never returned by the warehouse, so warehouse-derived status says
  // nothing about it. It is always available.
  if (isCalculatedField(field)) return true;
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

/**
 * The comparison type of a field as filter/aggregation machinery must see it. A BigQuery
 * REPEATED field stores its ELEMENT type (`STRING` + mode `REPEATED`), but the column is
 * an ARRAY<STRING>: string operators and TRIM() are type errors on it, and only the
 * type-agnostic operators (is_blank / is_null pairs, rendered as bare `col IS NULL`) are
 * valid SQL. Wrapping the collected type as `ARRAY<T>` files it under the `other`
 * category everywhere downstream — validator gating, the MCP field-type matrix, and the
 * renderers' blank/cast branches — so all three surfaces agree (#6779).
 */
function comparisonType(field: DataMartSchemaField): string {
  const rawType = String(field.type);
  return 'mode' in field && field.mode === BigQueryFieldMode.REPEATED
    ? `ARRAY<${rawType}>`
    : rawType;
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
    result.push({ name: fullName, type: comparisonType(field), field });
    if ('fields' in field && field.fields?.length) {
      result.push(...collectSchemaFieldPathDescriptors(field.fields, fullName));
    }
  }
  return result;
}

// A calculated-field formula may legally reference a HIDDEN field: isHiddenForReporting takes a
// column off the reporting menu, it does not remove it from the source, and computing is not
// projecting. Deliberately NOT built on collectSchemaFieldPathDescriptors, whose callers
// (reporting/blending) depend on it pruning hidden fields. DISCONNECTED still prunes: a
// disconnected field really is gone from the source, unlike a hidden one.
export function collectFormulaReferenceableFields(
  fields: readonly DataMartSchemaField[],
  prefix = ''
): { name: string; field: DataMartSchemaField }[] {
  const result: { name: string; field: DataMartSchemaField }[] = [];
  for (const field of fields) {
    if (!isConnected(field)) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push({ name: fullName, field });
    if ('fields' in field && field.fields?.length) {
      result.push(
        ...collectFormulaReferenceableFields(field.fields as DataMartSchemaField[], fullName)
      );
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

/**
 * How long a stored formula may be. Lives here, next to the schema it bounds, because the live
 * validation endpoint bounds its own request body by the same number — a request the save would
 * refuse must not be accepted by the editor's live channel, or the two disagree.
 */
export const CALCULATED_FORMULA_MAX_LENGTH = 10_000;

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
      calculated: z
        .object({
          // Stored form: dialect SQL with {{ref}} tags. Bounded because it lives in a JSON column
          // and renders into generated SQL.
          formula: z.string().min(1).max(CALCULATED_FORMULA_MAX_LENGTH),
          // Derived by CalculatedFieldValidatorService from the formula, never chosen: 'metric'
          // when the formula aggregates, 'column' when it is row-level. Accepted on the wire only
          // so a round-trip of an unchanged field validates, and optional because the web no
          // longer sends one at all. Every path that can INTRODUCE or EDIT a formula runs that
          // validator and refuses the save on any error, so no client-supplied level survives; the
          // two paths that touch a stored schema without it (the joined-alias rename cascade,
          // schema actualization) only carry an already-derived level through.
          //
          // Optional is load-bearing on READ, not just on the wire: `createZodTransformer.from`
          // parses this schema every time a Data Mart is loaded, so a required `level` would turn
          // one legacy row into a 500 for the whole Data Mart rather than a refused save. Read it
          // defensively for the same reason — `=== 'column'` is the row-level test, so an absent
          // value reads as 'metric', the pre-existing behaviour.
          level: z.enum(CALCULATED_FIELD_LEVELS).optional(),
          // 'skipped' = saved while the warehouse was unreachable; re-checked on the next save.
          warehouseValidation: z.enum(['passed', 'skipped']).optional(),
        })
        .optional()
        .describe('Formula definition; present only on calculated fields'),
      status: z
        .nativeEnum(DataMartSchemaFieldStatus)
        .describe('Field status relatively to the actual data mart schema'),
    })
    // ROLLING-DEPLOY SAFETY, and it is about data loss rather than validation. This schema is a
    // TypeORM value transformer: `createZodTransformer.from` parses it on every entity LOAD, and a
    // bare `z.object` STRIPS keys it does not know. So a pod running the previous release, handed a
    // field carrying a key that release has never heard of, drops it on read — and then persists
    // the stripped version, because schema actualization writes the schema back on every report run
    // and on every Looker `getSchema`.
    //
    // That is how `calculated` can be lost during this feature's own rollout, and no code in this
    // release can prevent it: the pod doing the stripping is the OLD one. `.passthrough()` is
    // therefore the fix for the NEXT additive change to this shape, not for this one. Keys nothing
    // reads are carried through untouched rather than deleted, which is the safe direction — an
    // unknown key is inert, while a deleted one is an analyst's work gone with a success toast.
    .passthrough()
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
