import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { AthenaClauseRenderer } from './athena-clause-renderer';

@Injectable()
export class AthenaBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_ATHENA;
  protected readonly identifierQuoteChar = '"';

  constructor(private readonly _renderer: AthenaClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this._renderer;
  }

  protected buildStringAgg(fieldName: string): string {
    return `ARRAY_JOIN(ARRAY_AGG(CAST(${fieldName} AS VARCHAR)), ', ')`;
  }

  // Trino does not guarantee ANY_VALUE across engine versions; arbitrary() is the all-version-safe form.
  protected override buildAnyValue(fieldName: string): string {
    return `arbitrary(${fieldName})`;
  }
}
