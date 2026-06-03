import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { AggregateFunction } from '../../dto/schemas/aggregate-function.schema';
import { FilterRule } from '../../dto/schemas/filter-config.schema';
import { SortRule } from '../../dto/schemas/sort-config.schema';
import { QueryBuildResult } from './data-mart-query-builder.interface';

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
  cteName: string;
  blendedFields: BlendedFieldConfig[];
  targetDataMartTitle: string;
  targetDataMartUrl: string;
}

/**
 * Storage field types for filter columns, so positional dialects (Athena) can cast
 * date/time placeholders. Split because pre-join slices target a subsidiary CTE's
 * raw columns (keyed by aliasPath) while post-join filters target final-SELECT
 * columns (home native + blended output aliases).
 */
export interface BlendedColumnTypes {
  postJoin?: ReadonlyMap<string, string>;
  preJoin?: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export interface BlendedQueryContext {
  mainTableReference: string;
  mainDataMartTitle: string;
  mainDataMartUrl: string;
  chains: ResolvedRelationshipChain[];
  columns: string[];
  filters?: FilterRule[];
  sort?: SortRule[];
  limit?: number | null;
  columnTypes?: BlendedColumnTypes;
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(context: BlendedQueryContext): string | QueryBuildResult;
}
