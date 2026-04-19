import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class RedshiftBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_REDSHIFT;
  protected readonly identifierQuoteChar = '"';

  protected buildStringAgg(fieldName: string): string {
    return `LISTAGG(CAST(${fieldName} AS VARCHAR), ', ')`;
  }
}
