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

    // One message whether the source is missing, excluded or inaccessible, so the answer cannot
    // tell a caller that a source it may not read exists.
    const reportableSources = new Set(columns.reportableSources);
    const unavailableSources = joinedUniqueCountSources(input.uniqueCount).filter(
      aliasPath => !reportableSources.has(aliasPath)
    );
    if (unavailableSources.length > 0) {
      throw new InvalidQueryColumnsException(
        `Unique Count source${unavailableSources.length > 1 ? 's' : ''} not available for reporting: ${unavailableSources.join(', ')}`,
        { sources: unavailableSources }
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
    // A requested Unique Count is an output column, as in Reports: what a clause may do with it
    // (sort: yes; filter, aggregate, bucket, list as a field: no, each with its own error) is
    // OutputControlsValidatorService's call, not a bare "Unknown column".
    for (const aliasPath of joinedUniqueCountSources(input.uniqueCount)) {
      referenced.delete(buildJoinedUniqueCountColumnName(aliasPath));
    }
    if (hasMainUniqueCount(input.uniqueCount)) referenced.delete(UNIQUE_COUNT_LABEL);
    return referenced;
  }
}
