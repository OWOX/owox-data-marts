import { Injectable } from '@nestjs/common';
import { isSqlDefinition } from '../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
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
 * Storage types whose SQL dialect accepts a WITH clause inside a parenthesized derived
 * table (GoogleSQL allows a full query expression in FROM parentheses). Other warehouses
 * vary here (e.g. Athena, Redshift), so for them only plain SELECT is inlined.
 */
const CTE_INLINE_STORAGE_TYPES: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
]);

/**
 * Inlines a data mart's SQL as a derived-table body when it can safely appear inside
 * `FROM (...)`: plain SELECT statements on any storage, WITH/CTE statements only on
 * storages known to accept a CTE inside a derived table. Trailing semicolons and
 * whitespace are stripped. Anything else returns null and keeps the technical-view path.
 *
 * Legacy BigQuery is never inlined: `definition.sqlQuery` holds the raw legacy ODM
 * query, which is executable only after `LegacyBigQuerySqlPreprocessor.prepare` — and
 * `executeSqlToTable` bypasses the query builder where that preprocessing happens.
 */
function toInlineSubquerySql(sqlQuery: string, storageType: DataStorageType): string | null {
  if (storageType === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
    return null;
  }
  const trimmed = sqlQuery.trim().replace(/[;\s]+$/, '');
  if (trimmed.includes(';')) {
    // A remaining semicolon means a multi-statement script (or a semicolon inside a
    // literal, which we cannot distinguish without a parser) — not wrappable in FROM (...).
    return null;
  }
  if (/^select\b/i.test(trimmed)) {
    return trimmed;
  }
  if (/^with\b/i.test(trimmed) && CTE_INLINE_STORAGE_TYPES.has(storageType)) {
    return trimmed;
  }
  return null;
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
   * which requires project-level `bigquery.datasets.create` that data-only users lack.
   * The view path remains for explicit table names, non-SQL definitions, and SQL that
   * cannot be inlined.
   */
  private async resolveSampleSource(
    dataMart: DataMart,
    fullyQualifiedTableName?: string
  ): Promise<string> {
    const storageType = dataMart.storage.type;

    if (!fullyQualifiedTableName) {
      const definition = dataMart.definition;
      if (definition && isSqlDefinition(definition)) {
        const inlineSql = toInlineSubquerySql(definition.sqlQuery, storageType);
        if (inlineSql) {
          // The newline before ')' keeps a trailing `--`/`#` line comment in the data
          // mart SQL from commenting out the closing parenthesis.
          return `(${inlineSql}\n) AS owox_sample_source`;
        }
      }
    }

    const fqn =
      fullyQualifiedTableName ??
      (await this.dataMartTableReferenceService.resolveTableName(dataMart.id, dataMart.projectId));

    return this.identifierEscaperFacade.escapeIdentifier(storageType, fqn);
  }
}
