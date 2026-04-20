import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class BigQueryBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;
  protected readonly identifierQuoteChar = '`';

  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(CAST(${fieldName} AS STRING), ', ')`;
  }
}
