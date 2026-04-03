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
}

export interface BlendableSchema {
  nativeFields: unknown[];
  blendedFields: BlendedField[];
}
