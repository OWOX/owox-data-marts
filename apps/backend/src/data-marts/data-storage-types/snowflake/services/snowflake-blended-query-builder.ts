import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { SnowflakeClauseRenderer } from './snowflake-clause-renderer';

@Injectable()
export class SnowflakeBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.SNOWFLAKE;
  protected readonly identifierQuoteChar = '"';

  constructor(private readonly _renderer: SnowflakeClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this._renderer;
  }

  // Snowflake folds UNQUOTED identifiers to UPPERCASE, so the base class's bare return
  // for simple names would miss the lowercase columns the OWOX connector creates (as
  // quoted). Always quote — case-stable, and consistent with the non-blended builder.
  protected quoteIdentifier(name: string): string {
    const q = this.identifierQuoteChar;
    return `${q}${name.split(q).join(q + q)}${q}`;
  }

  protected buildStringAgg(fieldName: string): string {
    // WITHIN GROUP (ORDER BY) makes the concatenation deterministic — Snowflake allows
    // omitting it (Redshift requires it), but a stable order matches the Redshift sibling.
    return `LISTAGG(CAST(${fieldName} AS VARCHAR), ', ') WITHIN GROUP (ORDER BY ${fieldName})`;
  }
}
