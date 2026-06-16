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
 * Storage field types for post-join filter columns (home native fields + blended
 * output aliases), so positional dialects (Athena) can cast date/time placeholders.
 * Pre-join slice types are resolved via the field index instead.
 */
export interface BlendedColumnTypes {
  postJoin?: ReadonlyMap<string, string>;
}

/**
 * Flat resolution entry for one blended field, keyed by its unified name
 * (`<aliasPath with dots→_>__<originalFieldName with dots→_>`). Single source of
 * truth for resolving a unified column identifier back to the data it encodes.
 */
export interface BlendedFieldEntry {
  aliasPath: string; // 'category.details'
  cteName: string; // 'category_details'
  originalFieldName: string; // 'item.event_count' (nested-struct dots preserved)
  type: string;
  isIncluded: boolean; // false when the source is excluded from reporting
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
  fieldIndex?: ReadonlyMap<string, BlendedFieldEntry>;
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(context: BlendedQueryContext): string | QueryBuildResult;
}
