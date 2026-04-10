import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';

@Injectable()
export class BigQueryBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  protected buildAggregation(aggregateFunction: string, fieldName: string): string {
    switch (aggregateFunction) {
      case 'STRING_AGG':
        return `STRING_AGG(CAST(${fieldName} AS STRING), ', ')`;
      case 'COUNT':
        return `COUNT(${fieldName})`;
      default:
        return `${aggregateFunction}(${fieldName})`;
    }
  }
}
