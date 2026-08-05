import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';
import { RedshiftClauseRenderer } from './redshift-clause-renderer';

@Injectable()
export class RedshiftBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_REDSHIFT;
  protected readonly identifierQuoteChar = '"';

  constructor(private readonly renderer: RedshiftClauseRenderer) {
    super();
  }

  protected get clauseRenderer(): SqlClauseRenderer {
    return this.renderer;
  }

  protected buildStringAgg(fieldName: string): string {
    return `LISTAGG(CAST(${fieldName} AS VARCHAR), ', ') WITHIN GROUP (ORDER BY ${fieldName})`;
  }

  // Redshift's window ORDER BY requires an actual column identifier — it explicitly
  // rejects constants ("Neither constants nor constant expressions can be used as
  // substitutes for column names", AWS Redshift docs), so the base class's
  // `ROW_NUMBER() OVER (ORDER BY 1)` fails to compile here. ORDER BY is optional for
  // ROW_NUMBER on Redshift (unlike Snowflake/Databricks), so omit it — every row still
  // gets a distinct sequential number, just in a nondeterministic order we don't care about.
  protected override buildRowSurrogate(partitionByRefs: readonly string[] = []): string {
    const partition = partitionByRefs.length ? `PARTITION BY ${partitionByRefs.join(', ')}` : '';
    return `ROW_NUMBER() OVER (${partition})`;
  }
}
