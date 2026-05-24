import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';

@Injectable()
export class SnowflakeBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.SNOWFLAKE;
  protected readonly identifierQuoteChar = '"';

  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }

  protected buildStringAgg(fieldName: string): string {
    return `LISTAGG(CAST(${fieldName} AS VARCHAR), ', ')`;
  }
}
