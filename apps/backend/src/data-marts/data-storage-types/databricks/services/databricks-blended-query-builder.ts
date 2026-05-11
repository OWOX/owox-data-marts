import { Injectable, NotImplementedException } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AbstractBlendedQueryBuilder } from '../../interfaces/abstract-blended-query-builder';
import { BlendedQueryContext } from '../../interfaces/blended-query-builder.interface';
import { SqlClauseRenderer } from '../../utils/sql-clause-renderer';

@Injectable()
export class DatabricksBlendedQueryBuilder extends AbstractBlendedQueryBuilder {
  readonly type = DataStorageType.DATABRICKS;
  protected readonly identifierQuoteChar = '`';

  protected get clauseRenderer(): SqlClauseRenderer | null {
    return null;
  }

  protected buildStringAgg(fieldName: string): string {
    return `CONCAT_WS(', ', COLLECT_LIST(CAST(${fieldName} AS STRING)))`;
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
