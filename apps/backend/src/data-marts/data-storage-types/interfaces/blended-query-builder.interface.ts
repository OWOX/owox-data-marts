import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/relationship-schemas';

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
  /** Title of the target data mart — used in the SQL comment above its raw CTE. */
  targetDataMartTitle: string;
  /** URL to the target data mart page — used in the SQL comment above its raw CTE. */
  targetDataMartUrl: string;
}

export interface BlendedQueryContext {
  mainTableReference: string;
  /** Title of the root data mart — used in the SQL comment above the `main` CTE. */
  mainDataMartTitle: string;
  /** URL to the root data mart page — used in the SQL comment above the `main` CTE. */
  mainDataMartUrl: string;
  chains: ResolvedRelationshipChain[];
  columns: string[];
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(context: BlendedQueryContext): string;
}
