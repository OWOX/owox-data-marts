import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  DataStorageReportReader,
  PrepareReportDataOptions,
} from '../../interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { ReportLike } from '../../../dto/domain/report-like-read-plan';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { isDuckDbDataMartSchema } from '../../data-mart-schema.guards';
import { isDuckDbCredentials } from '../../data-storage-credentials.guards';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { resolveReportDataHeaders } from '../../utils/report-data-headers.utils';
import {
  DuckDbApiAdapter,
  DuckDbQueryLimits,
  DuckDbQueryStream,
} from '../adapters/duckdb-api.adapter';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import { DuckDbReportHeadersGenerator } from './duckdb-report-headers-generator.service';
import { serializeDuckDbValue } from '../utils/duckdb-value.utils';
import {
  DuckDbReaderState,
  isDuckDbReaderState,
} from '../interfaces/duckdb-reader-state.interface';

/**
 * DuckDB report reader. Unlike Snowflake/Athena/BigQuery (a remote warehouse serving a
 * server-side result handle), DuckDB is an embedded, file-backed engine with no
 * out-of-process result cache — so this reader reads the query result via a STREAMING
 * cursor (`DuckDbApiAdapter.streamQuery`) and never materializes the whole result set in
 * memory. `readReportDataBatch` pulls chunk-sized pages from the stream and buffers only the
 * (small) leftover past `maxDataRows` in `this.leftover`. A read without a batch id runs the
 * query again from its first row, as BigQuery's first page does.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class DuckDbReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(DuckDbReportReader.name);
  readonly type = DataStorageType.DUCKDB;
  readonly honorsQueryTimeout = true;

  private reportDataHeaders: ReportDataHeader[];
  private adapter?: DuckDbApiAdapter;
  private pendingQuery!: string;
  private queryLimits: DuckDbQueryLimits = {};

  // Per-run streaming cursor state.
  private stream?: DuckDbQueryStream;
  private leftover: Record<string, unknown>[] = [];
  private exhausted = false;
  private batchCounter = 0;

  constructor(
    private readonly adapterFactory: DuckDbApiAdapterFactory,
    private readonly queryBuilder: DuckDbQueryBuilder,
    private readonly headersGenerator: DuckDbReportHeadersGenerator,
    private readonly credentialsResolver: DataStorageCredentialsResolver
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
      // Mirrors DuckDbClauseRenderer: every DuckDB fragment inlines literal values (no
      // bound-parameter channel on this read path), so a caller-supplied sqlOverride has
      // nowhere to bind params either.
      throw new Error('DuckDB report reader does not support parameterized sqlOverride');
    }

    if (!schema) {
      throw new Error('DuckDB data mart schema is required for header generation');
    }

    if (!isDuckDbDataMartSchema(schema)) {
      throw new Error('DuckDB data mart schema is expected');
    }

    this.reportDataHeaders = resolveReportDataHeaders(
      this.headersGenerator.generateHeaders(schema),
      options,
      this.type
    );

    const built =
      options?.sqlOverride ??
      this.queryBuilder.buildQuery(definition, { columns: options?.columnFilter });
    this.pendingQuery = isQueryBuildResult(built) ? built.sql : built;

    const credentials = await this.credentialsResolver.resolve(storage);
    if (!isDuckDbCredentials(credentials)) throw new Error('DuckDB database path is not resolved');
    this.adapter = this.adapterFactory.createForDatabasePath(credentials.databasePath);
    this.queryLimits = { timeoutMs: options?.queryTimeoutMs, signal: options?.signal };

    // Reset per-run cursor state so a re-prepared TRANSIENT instance never leaks a
    // previous run's stream/leftover — the stream itself is opened lazily on first batch.
    this.stream = undefined;
    this.leftover = [];
    this.exhausted = false;
    this.batchCounter = 0;

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.reportDataHeaders || !this.adapter) {
      throw new Error('Report data must be prepared before read');
    }

    // The Looker Studio cache reads a row before its request reads from the first one.
    if (!batchId) await this.restart();
    if (!this.exhausted) await this.ensureStream();

    const out = this.leftover;
    this.leftover = [];
    while (!this.exhausted && out.length < maxDataRows) {
      const rows = await this.stream!.fetchRows();
      if (!rows) {
        this.exhausted = true;
        break;
      }
      out.push(...rows);
    }
    if (out.length > maxDataRows) {
      this.leftover = out.splice(maxDataRows);
    }

    const mappedRows = this.mapRowsToHeaders(out);

    // Note: when a chunk lands exactly on the `maxDataRows` boundary, `exhausted` is not
    // yet known (no `fetchRows()` was actually attempted this call) — hasMore stays true
    // and the NEXT call discovers exhaustion for real (an empty final batch with a null
    // token). This mirrors the same "≥ maxDataRows implies more" convention the Snowflake
    // reader uses.
    const hasMore = !this.exhausted || this.leftover.length > 0;

    this.logger.debug(`Returning DuckDB batch with ${mappedRows.length} rows`);

    return new ReportDataBatch(mappedRows, hasMore ? String(++this.batchCounter) : null);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing DuckDB report read');
    try {
      await this.stream?.close();
    } finally {
      this.stream = undefined;
      await this.adapter?.close();
    }
  }

  getState(): DuckDbReaderState | null {
    if (!this.pendingQuery) {
      return null;
    }

    return { type: DataStorageType.DUCKDB, sql: this.pendingQuery };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isDuckDbReaderState(state)) {
      throw new Error('Invalid state type for DuckDB reader');
    }

    this.pendingQuery = state.sql ?? this.pendingQuery;
    this.reportDataHeaders = reportDataHeaders;
  }

  private async restart(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    this.leftover = [];
    this.exhausted = false;
    this.batchCounter = 0;
    await stream?.close();
  }

  /** Lazily opens the streaming cursor on first use. */
  private async ensureStream(): Promise<void> {
    if (!this.stream) {
      this.stream = await this.adapter!.streamQuery(this.pendingQuery, this.queryLimits);
    }
  }

  private mapRowsToHeaders(rows: Record<string, unknown>[]): unknown[][] {
    const headerNames = this.reportDataHeaders.map(h => h.name);

    return rows.map(row =>
      headerNames.map(name => {
        if (!(name in row)) {
          this.logger.warn(`Column '${name}' not found in query results`);
          return null;
        }
        return serializeDuckDbValue(row[name]);
      })
    );
  }
}
