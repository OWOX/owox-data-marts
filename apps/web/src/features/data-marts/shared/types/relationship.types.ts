import type { UserProjection } from '../../../../shared/types';

export interface JoinCondition {
  sourceFieldName: string;
  targetFieldName: string;
}

export interface BlendedFieldConfig {
  targetFieldName: string;
  outputAlias: string;
  isHidden: boolean;
  aggregateFunction: string;
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
  blendedFields: BlendedFieldConfig[];
  createdById: string;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: UserProjection | null;
}

export interface CreateRelationshipRequest {
  targetDataMartId: string;
  targetAlias: string;
  joinConditions: JoinCondition[];
  blendedFields: (Omit<BlendedFieldConfig, 'isHidden' | 'aggregateFunction'> & {
    isHidden?: boolean;
    aggregateFunction?: string;
  })[];
}

export interface UpdateRelationshipRequest {
  targetAlias?: string;
  joinConditions?: JoinCondition[];
  blendedFields?: BlendedFieldConfig[];
}

export interface TransientRelationshipRow {
  relationship: DataMartRelationship;
  depth: number;
  parentDataMartTitle: string;
  sourceDmId: string;
  isBlocked: boolean;
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
  aggregateFunction: string;
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
}

export interface AvailableSource {
  aliasPath: string;
  title: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
}

export interface BlendableSchema {
  nativeFields: unknown[];
  blendedFields: BlendedField[];
  availableSources: AvailableSource[];
}

export interface BlendedFieldOverride {
  alias?: string;
  isHidden?: boolean;
  aggregateFunction?: string;
}

export interface BlendedSource {
  path: string;
  alias: string;
  isExcluded?: boolean;
  fields?: Record<string, BlendedFieldOverride>;
}

export type BlendingBehaviour = 'AUTO_BLEND_ALL' | 'BLEND_DIRECT_ONLY' | 'MANUAL';

export interface BlendedFieldsConfig {
  blendingBehaviour: BlendingBehaviour;
  sources: BlendedSource[];
}
