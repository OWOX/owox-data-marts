import type { UserProjection } from '../../../../shared/types';

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
  createdById: string;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: UserProjection | null;
}

export interface CreateRelationshipRequest {
  targetDataMartId: string;
  targetAlias: string;
  joinConditions: JoinCondition[];
}

export interface UpdateRelationshipRequest {
  targetAlias?: string;
  joinConditions?: JoinCondition[];
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
}
export interface NativeField {
  name: string;
  type?: string;
  alias?: string;
  description?: string;
  isHiddenForReporting?: boolean;
  status?: string;
  fields?: NativeField[];
  isPrimaryKey?: boolean;
  // Aggregation governance (optional; absent → type-derived defaults on the web).
  aggregationRole?: AggregationRole;
  allowedAggregations?: ReportAggregateFunction[];
}

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
}

export interface BlendableSchema {
  nativeFields: unknown[];
  nativeDescription?: string;
  blendedFields: BlendedField[];
  availableSources: AvailableSource[];
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
