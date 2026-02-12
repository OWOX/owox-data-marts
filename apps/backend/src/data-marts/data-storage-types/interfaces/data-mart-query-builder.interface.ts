import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';

export interface DataMartQueryOptions {
  limit?: number;
}

export interface DataMartQueryBuilder {
  readonly type: DataStorageType;
  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): string;
}

export interface DataMartQueryBuilderAsync {
  readonly type: DataStorageType;
  buildQuery(definition: DataMartDefinition, queryOptions?: DataMartQueryOptions): Promise<string>;
}
