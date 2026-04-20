import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';

export interface DataMartQueryOptions {
  limit?: number;
  /**
   * Optional list of column expressions to project via SELECT.
   * When set, `SELECT *` is replaced with `SELECT <escaped-columns>`.
   * Each builder escapes per its dialect. SQL-definition data marts are
   * wrapped as `SELECT <cols> FROM (<user-sql>)` to avoid mutating user SQL.
   */
  columns?: string[];
}

export interface DataMartQueryBuilder {
  readonly type: DataStorageType;
  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string;
}

export interface DataMartQueryBuilderAsync {
  readonly type: DataStorageType;
  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): Promise<string>;
}
