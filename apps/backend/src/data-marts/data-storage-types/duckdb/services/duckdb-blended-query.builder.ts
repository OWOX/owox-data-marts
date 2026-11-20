import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';

@Injectable()
export class DuckDbBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.DUCKDB;
  protected readonly identifierQuoteChar = '"';

  constructor(private readonly _renderer: DuckDbClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this._renderer;
  }

  protected buildStringAgg(fieldName: string): string {
    return `string_agg(CAST(${fieldName} AS VARCHAR), ', ' ORDER BY CAST(${fieldName} AS VARCHAR))`;
  }

  // buildAnyValue: DuckDB has native ANY_VALUE support, so the base class's
  // `ANY_VALUE(${fieldName})` default is valid DuckDB SQL — no override needed here,
  // unlike Athena/Trino which must override it to arbitrary(...).
}
