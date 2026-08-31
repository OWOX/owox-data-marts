import type { UserProjection } from '../../../../shared/types';
import type { CalculatedFieldConfig } from './data-mart-schema.types';

// Keep this list in sync with `AGGREGATE_FUNCTIONS` on the backend side
// (`apps/backend/src/data-marts/dto/schemas/aggregate-function.schema.ts`).
// The two declarations mirror each other so the blended SQL builder and
// the UI expose identical options.
export const AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'AVG',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

// Report-level aggregate functions add the percentile set on top of the blend list.
// Mirror of the backend `REPORT_AGGREGATE_FUNCTIONS`. Lives here (not output-config.ts)
// so `BlendedField` can carry `allowedAggregations` without a circular import.
export const PERCENTILE_FUNCTIONS = ['P25', 'P50', 'P75', 'P95'] as const;
export const REPORT_AGGREGATE_FUNCTIONS = [
  ...AGGREGATE_FUNCTIONS,
  ...PERCENTILE_FUNCTIONS,
] as const;
export type ReportAggregateFunction = (typeof REPORT_AGGREGATE_FUNCTIONS)[number];

export type AggregationRole = 'dimension' | 'metric';

export interface JoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface RelatedDataMart {
  id: string;
  title: string;
  description?: string;
  status: string;
  userHasAccess: boolean;
  hasPrimaryKey?: boolean;
}

export interface DataMartRelationship {
  id: string;
  dataStorageId: string;
  sourceDataMart: RelatedDataMart;
  targetDataMart: RelatedDataMart;
  targetAlias: string;
  joinConditions: JoinCondition[];
  /** Business meaning of this relationship, shared with AI assistants. */
  description?: string;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: UserProjection | null;
}

export interface CreateRelationshipRequest {
  targetDataMartId: string;
  targetAlias: string;
  joinConditions: JoinCondition[];
  description?: string;
}

export interface UpdateRelationshipRequest {
  targetAlias?: string;
  joinConditions?: JoinCondition[];
  /** Omit to leave untouched; null or an empty string clears it. */
  description?: string | null;
}

export interface RelationshipGraphNode {
  relationship: DataMartRelationship;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

export interface RelationshipGraph {
  rootDataMartId: string;
  nodes: RelationshipGraphNode[];
}

export interface TransientRelationshipRow {
  relationship: DataMartRelationship;
  depth: number;
  parentDataMartTitle: string;
  sourceDmId: string;
  isBlocked: boolean;
  aliasPath: string;
  /**
   * Stable identifier encoding the full relationship path from the root.
   * Unique across rows even when the same relationship is reached via
   * multiple parents (e.g. two direct parents pointing at the same DM
   * produce identical children — distinct rows, but same rel.id/depth).
   */
  rowKey: string;
  isCycleStub?: boolean;
}

export interface BlendedField {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  /**
   * The RAW source-field type, before the dedup effective-type resolution overwrites `type`.
   * Absent on legacy payloads → callers fall back to `type` (#6733).
   */
  sourceFieldType?: string;
  alias: string;
  description: string;
  isHidden: boolean;
  /**
   * Whether this is a CALCULATED field of the joined Data Mart — a formula, with no column behind
   * it. It is listed so a client can tell "not there" apart from "there, but not usable from here":
   * a formula on the main Data Mart may not reference one, and it cannot be selected as a report
   * column either. Optional on the wire — a response cached before the field existed carries none.
   */
  isCalculated?: boolean;
  aggregateFunction: AggregateFunction;
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
  /** Aggregation governance — absent fields fall back to type-derived defaults. */
  aggregationRole?: AggregationRole;
  allowedAggregations?: ReportAggregateFunction[];
  /**
   * Analyst-allowed post-join aggregation set. An explicit empty array `[]` means NONE are
   * allowed; `undefined` (absent) means fall back to the field type's default aggregations —
   * consistent with `resolveColumnAllowedAggregations` and `cleanBlendedFieldOverride`.
   */
  postJoinAggregations?: ReportAggregateFunction[];
}

export interface BlendedGroup {
  aliasPath: string;
  title: string;
  alias: string;
  description?: string;
  isAccessibleForReporting: boolean;
  visibleFields: BlendedField[];
  selectedCount: number;
  /**
   * The source's own Unique Count row, present when one should render. It belongs to the SOURCE,
   * not to any of its fields — so a group whose fields are all filtered out (or that contributes
   * no field at all) still exists as long as this is set.
   *
   * `isEmitted` is whether the metric reaches the rendered SELECT: a CHECKED row that is not
   * emitted is a stored selection the query drops, and must not read as a live one.
   */
  uniqueCount?: {
    label: string;
    description?: string;
    dataMartName?: string;
    checked: boolean;
    isEmitted: boolean;
  };
}
export interface NativeField {
  name: string;
  type?: string;
  /** BigQuery field mode; 'REPEATED' marks an ARRAY column (other storages omit it). */
  mode?: string;
  alias?: string;
  description?: string;
  isHiddenForReporting?: boolean;
  status?: string;
  fields?: NativeField[];
  isPrimaryKey?: boolean;
  // Aggregation governance (optional; absent → type-derived defaults on the web).
  aggregationRole?: AggregationRole;
  allowedAggregations?: ReportAggregateFunction[];
  /**
   * Present only on a calculated field — a field computed from a formula rather than sourced
   * from the warehouse. The picker never reads `formula` itself; its mere presence is
   * what rules 1 and 3 (no aggregation control, no blended-report selection) key off.
   */
  calculated?: CalculatedFieldConfig;
}

// Mirror of the backend `JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES` (data-mart-schema.utils.ts): why a
// JOINED source can or cannot offer the Unique Count metric. The three failure values each get their
// own hint. Kept as an array so the client can also RECOGNISE a value at runtime — a payload carrying
// a state added after this bundle shipped must not be read as any of these.
// The MAIN Data Mart follows a different rule and has its own vocabulary — see
// `MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES` in shared/utils/unique-count-availability.ts.
export const JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES = [
  'available',
  'no-primary-key',
  'disconnected-primary-key',
  'nested-primary-key',
  'nested-and-disconnected-primary-key',
] as const;

export type JoinedUniqueCountAvailability =
  (typeof JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES)[number];

export interface AvailableSource {
  aliasPath: string;
  title: string;
  description?: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
  isAccessibleForReporting: boolean;
  // Optional for the same reason as the key fields below, and read only through
  // `readJoinedUniqueCountState`, which maps anything it does not recognise to 'unknown'.
  uniqueCountAvailability?: JoinedUniqueCountAvailability;
  // The primary-key columns this source's Unique Count counts by, in schema order. Empty whenever
  // the metric is unavailable. Optional on the wire: a response cached before the field existed
  // carries none, and the description is simply omitted then.
  uniqueCountKeyFields?: string[];
}

export interface BlendableSchema {
  nativeFields: unknown[];
  nativeDescription?: string;
  // The main Data Mart's Unique Count key, in schema order; empty when the metric is unavailable.
  // Not derivable from `nativeFields`, which has had hidden-for-reporting fields stripped — a
  // hidden key column is still counted, since counting does not project it. Optional on the wire
  // for the same reason as the joined sources' fields: a response cached before it existed.
  mainUniqueCountKeyFields?: string[];
  blendedFields: BlendedField[];
  availableSources: AvailableSource[];
  /**
   * Every calculated field of the main Data Mart whose formula references a field the schema no
   * longer has — resolved backend-side against the Data Mart's RAW schema, never
   * derivable client-side from `nativeFields` (already stripped of reporting-hidden fields, which
   * a formula may still legally reference). A metric with no issue is simply absent here. Optional
   * on the wire for the same reason as the other derived fields above: a response cached before it
   * existed simply carries none — read as "nothing is broken," the same fail-open default as an
   * absent entry for a metric this DOES know about.
   */
  calculatedFieldIssues?: CalculatedFieldIssue[];
}

export interface CalculatedFieldIssue {
  field: string;
  missing: string[];
}

export interface BlendedFieldOverride {
  alias?: string;
  isHidden?: boolean;
  aggregateFunction?: AggregateFunction;
  postJoinAggregations?: ReportAggregateFunction[];
}

export interface BlendedSource {
  path: string;
  alias: string;
  isExcluded?: boolean;
  fields?: Record<string, BlendedFieldOverride>;
}

export interface BlendedFieldsConfig {
  sources: BlendedSource[];
}
