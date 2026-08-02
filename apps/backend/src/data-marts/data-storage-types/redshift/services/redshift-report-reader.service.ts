import { Injectable, Logger, Scope } from '@nestjs/common';
import { ColumnMetadata, Field } from '@aws-sdk/client-redshift-data';
import {
  DataStorageReportReader,
  PrepareReportDataOptions,
} from '../../interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { ReportLike } from '../../../dto/domain/report-like-read-plan';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftApiAdapter } from '../adapters/redshift-api.adapter';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { RedshiftReportHeadersGenerator } from './redshift-report-headers-generator.service';
import { isRedshiftDataMartSchema } from '../../data-mart-schema.guards';
import { RedshiftReaderState } from '../interfaces/redshift-reader-state.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorage } from '../../../entities/data-storage.entity';
import { resolveReportDataHeaders } from '../../utils/report-data-headers.utils';
import { truncateIdentifierToByteLimit } from '../../utils/identifier-limits.utils';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';

@Injectable({ scope: Scope.TRANSIENT })
export class RedshiftReportReader implements DataStorageReportReader {
  readonly type = DataStorageType.AWS_REDSHIFT;
  private readonly logger = new Logger(RedshiftReportReader.name);

  private adapter?: RedshiftApiAdapter;
  private statementId?: string;
  private reportDataHeaders: ReportDataHeader[] = [];
  /** Result column labels, in Data-API record order. Resolved once, reused across pages. */
  private resultColumnNames?: string[];
  private reportConfig?: {
    storage: DataStorage;
    definition: DataMartDefinition;
  };
  private pendingQuery?: string;

  constructor(
    private readonly adapterFactory: RedshiftApiAdapterFactory,
    private readonly queryBuilder: RedshiftQueryBuilder,
    private readonly headersGenerator: RedshiftReportHeadersGenerator
  ) {}

  async prepareReportData(
    report: ReportLike,
    options?: PrepareReportDataOptions
  ): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;

    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (options?.sqlOverrideParams?.length) {
      throw new Error('Redshift report reader does not support parameterized sqlOverride');
    }

    if (!schema || !isRedshiftDataMartSchema(schema)) {
      throw new Error('Redshift data mart schema is required');
    }

    this.reportConfig = { storage, definition };
    this.resultColumnNames = undefined;
    this.reportDataHeaders = resolveReportDataHeaders(
      this.headersGenerator.generateHeaders(schema),
      options,
      this.type
    );
    this.pendingQuery =
      options?.sqlOverride ??
      this.queryBuilder.buildQuery(definition, { columns: options?.columnFilter });

    this.adapter = await this.adapterFactory.createFromStorage(storage);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(batchId?: string, _maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.statementId) {
      await this.initializeReportData();
    }

    if (!this.adapter || !this.statementId) {
      throw new Error('Report data must be prepared before read');
    }

    const results = await this.adapter.getQueryResults(this.statementId, batchId);

    if (!results.Records) {
      throw new Error('Failed to get query results');
    }

    // The Data API returns each row as a positional `Field[]`, so this reader used to map
    // records straight to positions — which silently assumed SELECT column order equals
    // `reportDataHeaders` order. That assumption no longer holds: an aggregated blended report
    // appends its metric-sleeve pulls AFTER the `Row Count` / `Unique Count` columns
    // while the header list places each aggregate at its own column's position. Bind
    // by NAME instead — like every other dialect's reader does — so column order is irrelevant.
    const { exact, folded } = await this.resolveColumnIndexes(
      this.adapter,
      this.statementId,
      results.ColumnMetadata
    );
    const indexByHeader = this.reportDataHeaders.map(header => ({
      header,
      index: this.resolveResultIndex(header.name, exact, folded),
    }));
    // Name binding replaced positional mapping, so a HEADER that matches no result column is
    // now the only way rows can go wrong — and it would do so invisibly, as a column of empty
    // cells. Fail loudly instead, the way the Athena reader already does for the same mismatch.
    // The reverse is not an error and is not checked: a result column no header claims (the
    // metric-sleeve pulls a blended query appends) is simply not projected by this report.
    const unmatched = indexByHeader.filter(e => e.index === undefined).map(e => e.header.name);
    if (unmatched.length > 0) {
      throw new Error(
        `Column(s) [${unmatched.join(', ')}] not found in query results ` +
          `(result columns: [${(this.resultColumnNames ?? []).join(', ')}])`
      );
    }
    // Two headers that differ only in case, or only past Redshift's identifier cut, resolve to
    // the SAME result column — the report would then show that one column's values twice, under
    // two names. Nothing here can tell which header the column belongs to, so refuse the read
    // rather than ship a plausible-looking wrong report.
    const claimedBy = new Map<number, string>();
    const collisions: string[] = [];
    for (const { header, index } of indexByHeader) {
      const owner = claimedBy.get(index!);
      if (owner === undefined) claimedBy.set(index!, header.name);
      else if (owner !== header.name) {
        collisions.push(
          `'${owner}' and '${header.name}' both match '${(this.resultColumnNames ?? [])[index!]}'`
        );
      }
    }
    if (collisions.length > 0) {
      // A BUSINESS violation, not a storage failure: the user can rename a column, and a bare
      // Error surfaces as a 500 labelled "Amazon Redshift returned an error" — which sends them
      // to AWS support for a report they could have fixed themselves.
      throw new BusinessViolationException(
        `Two report columns resolve to the same result column, so their values cannot be told ` +
          `apart: ${collisions.join('; ')}. Rename one of each pair`
      );
    }
    const rows = results.Records.map(record =>
      indexByHeader.map(({ index }) => this.extractFieldValue(record[index!]))
    );

    return new ReportDataBatch(rows, results.NextToken);
  }

  /**
   * Result column label → record index, exact and case-folded.
   *
   * Labels come from `ColumnMetadata` (the SQL output alias). Redshift runs with
   * `enable_case_sensitive_identifier` off by default, which lower-cases identifiers even when
   * the SQL quotes them — so an aggregate alias emitted as `"amount | SUM"` comes back labelled
   * `amount | sum` and would never match its header name exactly. Case-folded lookup is the
   * correct fallback here precisely because the engine itself cannot distinguish two labels that
   * differ only in case. Exact match still wins, for a workgroup that has the setting enabled.
   *
   * Cached because only the first page is guaranteed to carry metadata; every page of one
   * statement has the same column list. A page that arrives without metadata AND with nothing
   * cached (a reader restored from a cached state that resumes mid-pagination) asks the API for
   * the statement's metadata explicitly rather than failing the read.
   */
  private async resolveColumnIndexes(
    adapter: RedshiftApiAdapter,
    statementId: string,
    columnMetadata?: ColumnMetadata[]
  ): Promise<{
    exact: Map<string, number>;
    folded: Map<string, number>;
  }> {
    if (!this.resultColumnNames) {
      const metadata = columnMetadata ?? (await adapter.getQueryResultsMetadata(statementId));
      this.resultColumnNames = metadata.map(col => col.label || col.name || '');
    }

    const exact = new Map<string, number>();
    const folded = new Map<string, number>();
    const duplicates: string[] = [];
    this.resultColumnNames.forEach((name, index) => {
      if (!name) return;
      // Duplicate labels (possible on an SQL override) are a duplication in the DATA, not in
      // the binding: the header for that name resolves to the FIRST occurrence, which is a
      // guess worth saying out loud but not worth failing a read the user can still use.
      if (exact.has(name)) duplicates.push(name);
      else exact.set(name, index);
      const key = name.toLowerCase();
      if (!folded.has(key)) folded.set(key, index);
    });
    if (duplicates.length > 0) {
      this.logger.warn(
        `Query result has duplicate column label(s) [${[...new Set(duplicates)].join(', ')}]; ` +
          `each header binds to the FIRST occurrence`
      );
    }
    return { exact, folded };
  }

  /**
   * Record index for one report header, most specific match first: exact label, then
   * case-folded (see `resolveColumnIndexes`), then the header cut to Redshift's identifier
   * limit. An output alias over that limit — a long blended column name plus its ` | SUM`
   * suffix, or a disambiguated sleeve name — reaches `ColumnMetadata` already truncated by the
   * engine, so it matches neither of the first two lookups; without this fallback such a report
   * fails outright where the old positional mapping still returned its rows.
   */
  private resolveResultIndex(
    name: string,
    exact: Map<string, number>,
    folded: Map<string, number>
  ): number | undefined {
    const direct = exact.get(name) ?? folded.get(name.toLowerCase());
    if (direct !== undefined) return direct;
    const cut = truncateIdentifierToByteLimit(name);
    if (cut === name) return undefined;
    return exact.get(cut) ?? folded.get(cut.toLowerCase());
  }

  private extractFieldValue(field?: Field): string | number | boolean | null {
    if (!field) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.longValue !== undefined) return field.longValue;
    if (field.doubleValue !== undefined) return field.doubleValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    return null;
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read (no cleanup required)');
  }

  private async initializeReportData(): Promise<void> {
    if (!this.reportConfig) {
      throw new Error('Report config not set');
    }

    if (!this.adapter) {
      throw new Error('Adapter not initialized');
    }

    const query = this.pendingQuery ?? this.queryBuilder.buildQuery(this.reportConfig.definition);

    const { statementId } = await this.adapter.executeQuery(query);
    this.statementId = statementId;

    await this.adapter.waitForQueryToComplete(statementId);
  }

  getState(): DataStorageReportReaderState | null {
    if (!this.statementId) return null;

    const state: RedshiftReaderState = {
      type: DataStorageType.AWS_REDSHIFT,
      statementId: this.statementId,
    };

    return state;
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (state.type !== DataStorageType.AWS_REDSHIFT) {
      throw new Error('Invalid state type for Redshift reader');
    }

    const redshiftState = state as RedshiftReaderState;
    this.statementId = redshiftState.statementId;
    this.reportDataHeaders = reportDataHeaders;
    this.resultColumnNames = undefined;
  }
}
