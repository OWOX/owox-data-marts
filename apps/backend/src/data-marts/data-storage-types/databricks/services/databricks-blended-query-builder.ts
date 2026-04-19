import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class DatabricksBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;
  protected readonly identifierQuoteChar = '`';

  protected buildStringAgg(fieldName: string): string {
    return `CONCAT_WS(', ', COLLECT_LIST(CAST(${fieldName} AS STRING)))`;
  }
}
