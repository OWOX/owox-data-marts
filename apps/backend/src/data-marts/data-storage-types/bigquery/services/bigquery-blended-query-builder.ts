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
    // ORDER BY makes the roll-up deterministic: the sleeve adds a SECOND reference to this
    // dedup CTE, and an engine that re-computes an inlined CTE could otherwise produce
    // 'A, B' for one reference and 'B, A' for the other — the join-back would then miss.
    return `STRING_AGG(CAST(${fieldName} AS STRING), ', ' ORDER BY CAST(${fieldName} AS STRING))`;
  }
}
