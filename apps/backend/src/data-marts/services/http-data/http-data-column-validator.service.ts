import { Injectable } from '@nestjs/common';
import { InvalidQueryColumnsException } from '../../errors/invalid-query-columns.exception';
import { FilterConfig } from '../../dto/schemas/filter-config.schema';
import { SortConfig } from '../../dto/schemas/sort-config.schema';
import { AggregationConfig } from '../../dto/schemas/aggregation-config.schema';
import { DateTruncConfig } from '../../dto/schemas/date-trunc-config.schema';
import { UniqueCountConfig } from '../../dto/schemas/unique-count-config.schema';
import {
  hasMainUniqueCount,
  joinedUniqueCountSources,
} from '../../dto/schemas/unique-count-sources';
import { UNIQUE_COUNT_LABEL } from '../../dto/schemas/aggregation-labels';
import { buildJoinedUniqueCountColumnName } from '../blended-field-name';
import { ReportingColumns } from './http-data-column-sets.util';

export interface HttpDataColumnValidationInput {
  selectedColumns: string[];
  filter?: FilterConfig;
  sort?: SortConfig;
  aggregation?: AggregationConfig;
  dateTrunc?: DateTruncConfig;
  uniqueCount?: UniqueCountConfig;
}

@Injectable()
export class HttpDataColumnValidator {
  validate(input: HttpDataColumnValidationInput, columns: ReportingColumns): void {
    const knownColumns = new Set([...columns.native, ...columns.blended]);

    const unknownColumns = Array.from(this.collectReferencedColumns(input)).filter(
      column => !knownColumns.has(column)
    );

    if (unknownColumns.length > 0) {
      throw new InvalidQueryColumnsException(
        `Unknown column${unknownColumns.length > 1 ? 's' : ''}: ${unknownColumns.join(', ')}`,
        { columns: unknownColumns }
      );
    }

    const reportableSources = new Set(columns.reportableSources);
    const unknownSources = joinedUniqueCountSources(input.uniqueCount).filter(
      aliasPath => !reportableSources.has(aliasPath)
    );
    if (unknownSources.length > 0) {
      throw new InvalidQueryColumnsException(
        `Unknown Unique Count source${unknownSources.length > 1 ? 's' : ''}: ${unknownSources.join(', ')}`,
        { columns: unknownSources }
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
    // A requested Unique Count is an output column a sort may name, as in Reports; whether the
    // rule is valid is then OutputControlsValidatorService's call, same as for a Report.
    const uniqueCountColumns = new Set(
      joinedUniqueCountSources(input.uniqueCount).map(buildJoinedUniqueCountColumnName)
    );
    if (hasMainUniqueCount(input.uniqueCount)) uniqueCountColumns.add(UNIQUE_COUNT_LABEL);
    for (const rule of input.sort ?? []) {
      if (!uniqueCountColumns.has(rule.column)) referenced.add(rule.column);
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
