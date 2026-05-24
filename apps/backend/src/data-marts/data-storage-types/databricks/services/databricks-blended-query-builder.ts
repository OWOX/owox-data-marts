import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';

@Injectable()
export class DatabricksBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;
  protected readonly identifierQuoteChar = '`';

  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }

  protected buildStringAgg(fieldName: string): string {
    return `CONCAT_WS(', ', COLLECT_LIST(CAST(${fieldName} AS STRING)))`;
  }
}
