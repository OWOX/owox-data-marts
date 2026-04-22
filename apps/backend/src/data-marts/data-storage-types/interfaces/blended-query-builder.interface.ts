import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';

export interface BlendedFieldConfig {
  targetFieldName: string;
  outputAlias: string;
  isHidden: boolean;
  aggregateFunction: AggregateFunction;
}

export interface ResolvedRelationshipChain {
  relationship: DataMartRelationship;
  targetTableReference: string;
  parentAlias: string;
  blendedFields: BlendedFieldConfig[];
  targetDataMartTitle: string;
  targetDataMartUrl: string;
}

export interface BlendedQueryContext {
  mainTableReference: string;
  mainDataMartTitle: string;
  mainDataMartUrl: string;
  chains: ResolvedRelationshipChain[];
  columns: string[];
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(context: BlendedQueryContext): string;
}
