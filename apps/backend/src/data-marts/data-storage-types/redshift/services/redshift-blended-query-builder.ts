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
}
