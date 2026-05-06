import { Injectable, NotImplementedException } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';

@Injectable()
export class RedshiftBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.AWS_REDSHIFT;
  protected readonly identifierQuoteChar = '"';

  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }

  protected buildStringAgg(fieldName: string): string {
    return `LISTAGG(CAST(${fieldName} AS VARCHAR), ', ') WITHIN GROUP (ORDER BY ${fieldName})`;
  }

  buildBlendedQuery(context: BlendedQueryContext) {
    if ((context.filters?.length ?? 0) > 0 || (context.sort?.length ?? 0) > 0) {
      throw new NotImplementedException(
        `Output controls not yet supported for storage type ${this.type}`
      );
    }
    return super.buildBlendedQuery(context);
  }
}
