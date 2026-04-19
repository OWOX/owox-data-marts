import type { UserProjection } from '../../../../shared/types';

// Keep this list in sync with `AGGREGATE_FUNCTIONS` on the backend side
// (`apps/backend/src/data-marts/dto/schemas/relationship-schemas.ts`).
// The two declarations mirror each other so the blended SQL builder and
// the UI expose identical options.
export const AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

export interface JoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface RelatedDataMart {
  id: string;
  title: string;
  description?: string;
  status: string;
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
}

export interface BlendedField {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  alias: string;
  description: string;
  isHidden: boolean;
  aggregateFunction: AggregateFunction;
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
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
