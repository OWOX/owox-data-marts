import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class AthenaBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;
  protected readonly identifierQuoteChar = '"';

  protected buildStringAgg(fieldName: string): string {
    return `ARRAY_JOIN(ARRAY_AGG(CAST(${fieldName} AS VARCHAR)), ', ')`;
  }
}
