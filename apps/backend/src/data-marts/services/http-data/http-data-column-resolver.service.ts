import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ColumnSelector } from '../../dto/schemas/http-data-query.schema';
import { ReportingColumns } from './http-data-column-sets.util';

@Injectable()
export class HttpDataColumnResolver {
  resolve(selector: ColumnSelector, columns: ReportingColumns): string[] {
    const resolved = [...new Set(this.select(selector, columns))];
    if (resolved.length === 0) {
      throw new BusinessViolationException('No columns available for the requested Data Mart');
    }
    return resolved;
  }

  private select(selector: ColumnSelector, columns: ReportingColumns): string[] {
    switch (selector.mode) {
      // A wildcard resolves through `implicitAllNative`/`implicitAllBlended`, not `native`/
      // `blended`: a calculated field is composed only when asked for by name, on either side of the join — an EXPLICIT name still reaches this method
      // verbatim, in `selector.explicit` below.
      case 'allBlendable':
        return [...columns.implicitAllNative, ...columns.implicitAllBlended];
      case 'allNative':
        return [...columns.implicitAllNative, ...selector.explicit];
      case 'explicit':
        return selector.explicit;
    }
  }
}
