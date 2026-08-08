import { Injectable } from '@nestjs/common';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartService } from './data-mart.service';
import { DataMartSqlTableService } from './data-mart-sql-table.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';

export interface SampleTableDataResult {
  columns: string[];
  rows: unknown[][];
}

/**
 * Inlines a data mart's SQL as a derived-table body when it can safely appear inside
 * `FROM (...)`: plain SELECT statements only, trailing semicolons stripped. SQL starting
 * with WITH (or anything else) returns null — not every supported warehouse accepts a CTE
 * inside a derived table, so those keep the technical-view path.
 */
function toInlineSubquerySql(sqlQuery: string): string | null {
  const trimmed = sqlQuery.trim().replace(/[;\s]+$/, '');
  return /^select\b/i.test(trimmed) ? trimmed : null;
}

@Injectable()
export class DataMartSampleDataService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly dataMartTableReferenceService: DataMartTableReferenceService,
    private readonly identifierEscaperFacade: IdentifierEscaperFacade
  ) {}

  async sampleColumns(
    dataMartId: string,
    projectId: string,
    columns: string[],
    fullyQualifiedTableName?: string,
    limit = 5
  ): Promise<SampleTableDataResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const storageType = dataMart.storage.type;
    const escapedColumns = await Promise.all(
      columns.map(column => this.identifierEscaperFacade.escapeIdentifier(storageType, column))
    );
    const source = await this.resolveSampleSource(dataMart, fullyQualifiedTableName);
    const sql = `SELECT ${escapedColumns.join(', ')} FROM ${source} LIMIT ${limit}`;

    const result = await this.dataMartSqlTableService.executeSqlToTable(dataMart, sql, { limit });

    return {
      columns: result.columns,
      rows: result.rows,
    };
  }

  /**
   * Builds the FROM source for the sample query.
   *
   * SQL-based data marts are inlined as a derived table whenever possible: sampling then
   * needs exactly the permissions a plain report run needs. The alternative — resolving
   * the technical view — creates the `owox_internal_<location>` dataset on first use,
   * which requires project-level `bigquery.datasets.create` that data-only users lack
   * (production incident 2026-08-05). The view path remains for explicit table names,
   * non-SQL definitions, and SQL that cannot be inlined.
   */
  private async resolveSampleSource(
    dataMart: DataMart,
    fullyQualifiedTableName?: string
  ): Promise<string> {
    const storageType = dataMart.storage.type;

    if (!fullyQualifiedTableName) {
      const definition = dataMart.definition;
      if (definition && isSqlDefinition(definition)) {
        const inlineSql = toInlineSubquerySql(definition.sqlQuery);
        if (inlineSql) {
          return `(${inlineSql}) AS owox_sample_source`;
        }
      }
    }

    const fqn =
      fullyQualifiedTableName ??
      (await this.dataMartTableReferenceService.resolveTableName(dataMart.id, dataMart.projectId));

    return this.identifierEscaperFacade.escapeIdentifier(storageType, fqn);
  }
}
