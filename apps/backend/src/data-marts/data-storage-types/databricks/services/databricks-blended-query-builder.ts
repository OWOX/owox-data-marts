import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { DatabricksClauseRenderer } from './databricks-clause-renderer';

@Injectable()
export class DatabricksBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;
  protected readonly identifierQuoteChar = '`';

  constructor(private readonly _renderer: DatabricksClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this._renderer;
  }

  // Spark is case-insensitive for identifier resolution and backticks do NOT make an
  // identifier case-sensitive (unlike Snowflake) — so the base's bare return for simple
  // names is safe; no quoteIdentifier override needed.
  protected buildStringAgg(fieldName: string): string {
    return `CONCAT_WS(', ', COLLECT_LIST(CAST(${fieldName} AS STRING)))`;
  }
}
