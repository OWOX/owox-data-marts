import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';

@Injectable()
export class BigQueryBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;
  protected readonly identifierQuoteChar = '`';

  constructor(private readonly _renderer: BigQueryClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this._renderer;
  }

  protected buildStringAgg(fieldName: string): string {
    return `STRING_AGG(CAST(${fieldName} AS STRING), ', ')`;
  }
}
