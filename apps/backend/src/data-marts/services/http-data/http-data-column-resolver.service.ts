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
      case 'allBlendable':
        return [...columns.native, ...columns.blended];
      case 'allNative':
        return [...columns.native, ...selector.explicit];
      case 'explicit':
        return selector.explicit;
    }
  }
}
