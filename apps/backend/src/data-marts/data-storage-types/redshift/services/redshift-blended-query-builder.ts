import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class RedshiftBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_REDSHIFT;

  protected buildAggregation(aggregateFunction: string, fieldName: string): string {
    switch (aggregateFunction) {
      case 'STRING_AGG':
        return `LISTAGG(${fieldName}, ', ')`;
      case 'COUNT':
        return `COUNT(${fieldName})`;
      default:
        return `${aggregateFunction}(${fieldName})`;
    }
  }
}
