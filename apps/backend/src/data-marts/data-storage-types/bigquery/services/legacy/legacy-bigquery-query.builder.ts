import { Injectable } from '@nestjs/common';
import { DataMartDefinition } from '../../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isSqlDefinition } from '../../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import {
  DataMartQueryOptions,
  QueryBuildResult,
} from '../../../interfaces/data-mart-query-builder.interface';
import { escapeBigQueryIdentifier } from '../../utils/bigquery-identifier.utils';
import { BigQueryClauseRenderer } from '../bigquery-clause-renderer';
import { BigQueryQueryBuilder } from '../bigquery-query.builder';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';

@Injectable()
export class LegacyBigQueryQueryBuilder extends BigQueryQueryBuilder {
  readonly type: DataStorageType = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    private readonly preprocessor: LegacyBigQuerySqlPreprocessor,
    clauseRenderer: BigQueryClauseRenderer
  ) {
    super(clauseRenderer);
  }

  async buildQuery(
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string | QueryBuildResult> {
    const hasOutputControls =
      (queryOptions?.filters?.length ?? 0) > 0 ||
      (queryOptions?.sort?.length ?? 0) > 0 ||
      queryOptions?.limit != null;

    // Output controls reference the materialized BQ view (mainTableReference), which is
    // already ODM-preprocessed at view-creation time, so the parent BigQuery builder does
    // the right thing and the legacy preprocessor must NOT re-run on this path.
    if (hasOutputControls) {
      return super.buildQuery(definition, queryOptions);
    }

    if (!isSqlDefinition(definition)) {
      throw new Error('Invalid data mart definition');
    }

    // Non-OC path: the legacy SQL must be ODM-preprocessed first (no view exists until
    // output controls trigger one). A column subset wraps the preprocessed SQL exactly as
    // BigQueryQueryBuilder does for native SQL marts, so the projection is honored in the
    // generated-SQL preview and copy-as-data-mart rather than silently dropped.
    const preparedSql = await this.preprocessor.prepare(definition.sqlQuery);
    if (!queryOptions?.columns?.length) {
      return preparedSql;
    }
    const cleanQuery = preparedSql.trim().replace(/;\s*$/, '');
    const selectList = queryOptions.columns.map(col => escapeBigQueryIdentifier(col)).join(', ');
    return `SELECT ${selectList} FROM (${cleanQuery})`;
  }
}
