import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { FilterConfig } from '../../dto/schemas/filter-config.schema';
import { SortConfig } from '../../dto/schemas/sort-config.schema';
import { AggregationConfig } from '../../dto/schemas/aggregation-config.schema';
import { DateTruncConfig } from '../../dto/schemas/date-trunc-config.schema';
import { ReportingColumns } from './http-data-column-sets.util';

export interface HttpDataColumnValidationInput {
  selectedColumns: string[];
  filter?: FilterConfig;
  sort?: SortConfig;
  aggregation?: AggregationConfig;
  dateTrunc?: DateTruncConfig;
}

@Injectable()
export class HttpDataColumnValidator {
  validate(input: HttpDataColumnValidationInput, columns: ReportingColumns): void {
    const knownColumns = new Set([...columns.native, ...columns.blended]);

    const unknownColumns = Array.from(this.collectReferencedColumns(input)).filter(
      column => !knownColumns.has(column)
    );

    if (unknownColumns.length > 0) {
      throw new BusinessViolationException(
        `Unknown column${unknownColumns.length > 1 ? 's' : ''}: ${unknownColumns.join(', ')}`,
        { columns: unknownColumns }
      );
    }
  }

  private collectReferencedColumns(input: HttpDataColumnValidationInput): Set<string> {
    const referenced = new Set<string>(input.selectedColumns);
    for (const rule of input.filter ?? []) {
      if (rule.placement !== 'pre-join') {
        referenced.add(rule.column);
      }
    }
    for (const rule of input.sort ?? []) {
      referenced.add(rule.column);
    }
    for (const rule of input.aggregation ?? []) {
      referenced.add(rule.column);
    }
    for (const rule of input.dateTrunc ?? []) {
      referenced.add(rule.column);
    }
    return referenced;
  }
}
