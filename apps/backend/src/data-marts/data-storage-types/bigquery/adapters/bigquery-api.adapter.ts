import { BigQuery, Job, Query, Table, TableSchema } from '@google-cloud/bigquery';
import { Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
import { BIGQUERY_AUTODETECT_LOCATION, BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BIGQUERY_OAUTH_TYPE, BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import type { SqlParameter } from '../../utils/sql-clause-renderer';
import {
  isValidBigQueryDatasetId,
  isValidBigQueryProjectId,
} from '../utils/bigquery-validation.utils';
import {
  GBQ_SHARD_SUFFIX_MAX_DIGITS,
  GBQ_SHARD_SUFFIX_MIN_DIGITS,
} from '../services/bigquery-sharded-tables.util';

/** Fully-qualified BigQuery table coordinates, as returned by a dry run's `referencedTables`. */
export interface BigQueryTableReference {
  projectId: string;
  datasetId: string;
  tableId: string;
}

/** BigQuery reports epoch-millis timestamps as strings; absent/garbage values become `null`. */
function toDateOrNull(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = new Date(Number(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Adapter for BigQuery API operations.
 * Accepts either Service Account credentials or pre-resolved OAuth credentials.
 *
 * Resource-listing (namespaces / tables) is handled by the dedicated
 * {@link BigQueryStorageResourceBrowser} service; this adapter focuses on
 * query execution, dry-run, and job management.
 */
export class BigQueryApiAdapter {
  /**
   * Interval between query-job status polls in {@link waitForJobToComplete}.
   * Large enough to keep the `jobs.get` call rate low on long-running jobs,
   * small enough that fast jobs add negligible latency.
   */
  private static readonly JOB_POLL_INTERVAL_MS = 2000;

  private readonly logger = new Logger(BigQueryApiAdapter.name);
  private readonly bigQuery: BigQuery;
  private readonly authClient: JWT | OAuth2Client;
  private location?: string;

  constructor(credentials: BigQueryCredentials, config: BigQueryConfig) {
    const auth =
      credentials.type === BIGQUERY_OAUTH_TYPE
        ? credentials.oauth2Client
        : new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: [
              'https://www.googleapis.com/auth/bigquery',
              'https://www.googleapis.com/auth/drive.readonly',
            ],
          });

    this.authClient = auth;
    const shouldAutodetectLocation = config.location === BIGQUERY_AUTODETECT_LOCATION;
    this.bigQuery = new BigQuery({
      projectId: config.projectId,
      authClient: auth,
      ...(shouldAutodetectLocation ? {} : { location: config.location }),
    });

    if (!shouldAutodetectLocation) {
      this.location = config.location;
    } else {
      this.logger.log(`Using autodetect location for BigQuery operations in ${config.projectId}`);
    }
  }

  /**
   * Executes a SQL query as a BigQuery job and resolves once the job reaches
   * the DONE state, returning only the job id. Callers resolve the job's
   * anonymous destination table (via {@link getJob}) and stream rows from it
   * page by page using `Table.getRows({ maxResults, autoPaginate: false })`.
   *
   * Implemented with `createQueryJob` + job-metadata polling, NOT
   * `bigQuery.query()`. `bigQuery.query()` calls `getQueryResults` under the
   * hood, which buffers the entire result set into the process heap before
   * resolving — for a large VIEW or SQL result (millions of rows) that
   * exhausts the worker's heap and OOM-kills it before a single row reaches
   * the destination. Polling job metadata fetches job status only (no row
   * data), so memory stays flat; the actual row streaming happens later, in
   * bounded pages, in the reader.
   *
   * Behaviour is identical for a SQL-query data mart and a VIEW-backed one —
   * both arrive here as a query string and only need the job to finish so
   * the destination table is materialised.
   *
   * When params are provided, BigQuery named parameter mode is used
   * (@paramName placeholders). The SDK infers types from JS values
   * (string, number, boolean, Date).
   *
   * `jobTimeoutMs` (already in ms) caps warehouse cost by aborting the job server-side; unset = no change.
   * `signal` (client disconnect/cancel) cancels the running job immediately — the poll loop then
   * surfaces the cancellation as a thrown error. Unset = no cancellation hook.
   */
  public async executeQuery(
    query: string,
    params?: SqlParameter[],
    jobTimeoutMs?: number,
    signal?: AbortSignal
  ): Promise<{ jobId: string }> {
    const queryConfig: Query = {
      query,
      ...this.getLocationOption(),
      ...(jobTimeoutMs !== undefined ? { jobTimeoutMs } : {}),
    };
    if (params && params.length > 0) {
      queryConfig.params = Object.fromEntries(params.map(p => [p.name, p.value]));
      queryConfig.parameterMode = 'NAMED';
    }

    const [job] = await this.bigQuery.createQueryJob(queryConfig);

    // Best-effort warehouse cancel: on abort, ask BigQuery to cancel the job. The poll loop below
    // then sees the job finish (cancelled) and throws, so we stop billing compute for a gone client.
    const onAbort = () => {
      job.cancel().catch(() => undefined);
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      await this.waitForJobToComplete(job, signal);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    this.setLocationFromJob(job);

    const jobId = job.id;
    if (!jobId) {
      throw new Error('Unexpected error during getting sql result job id');
    }
    return { jobId };
  }

  /**
   * Polls a query job's metadata until it reaches the DONE state. Issues
   * `jobs.get` only (job status, no row data), so memory usage is constant
   * regardless of result size. Throws when the job finished with an error
   * (e.g. invalid SQL) so a bad query still surfaces as a thrown error from
   * {@link executeQuery}, matching the previous `bigQuery.query()` behaviour.
   */
  private async waitForJobToComplete(job: Job, signal?: AbortSignal): Promise<void> {
    let repolledAfterAbort = false;
    while (true) {
      const [metadata] = await job.getMetadata();
      if (metadata?.status?.state === 'DONE') {
        const errorResult = metadata.status.errorResult;
        if (errorResult) {
          throw new Error(
            errorResult.message ?? 'BigQuery query job failed without an error message'
          );
        }
        return;
      }
      // One immediate re-poll after job.cancel(), then a bounded interval — never busy-poll jobs.get.
      if (signal?.aborted && !repolledAfterAbort) {
        repolledAfterAbort = true;
        continue;
      }
      await this.edgeInterruptibleSleep(BigQueryApiAdapter.JOB_POLL_INTERVAL_MS, signal);
    }
  }

  private edgeInterruptibleSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      // Fires only on the abort edge; if already aborted it never fires, so the full interval elapses.
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Executes a dry run query to estimate the number of bytes processed.
   *
   * `params` must be supplied whenever the query carries `@name` placeholders — a dry run
   * validates the query, so unbound parameters fail it just like a real execution would.
   *
   * `referencedTables` lists every table the query reads. BigQuery expands views (including
   * nested ones) down to their base tables here, so callers get the full source set without
   * parsing SQL themselves. BigQuery populates it for queries referencing up to ~50 tables
   * and omits it beyond that, so an empty array on a non-trivial query means "unknown",
   * not "reads nothing".
   */
  public async executeDryRunQuery(
    query: string,
    params?: SqlParameter[]
  ): Promise<{
    totalBytesProcessed: number;
    schema?: TableSchema;
    location?: string;
    referencedTables: BigQueryTableReference[];
  }> {
    const queryConfig: Query = {
      query,
      dryRun: true,
      ...this.getLocationOption(),
    };
    if (params && params.length > 0) {
      queryConfig.params = Object.fromEntries(params.map(p => [p.name, p.value]));
      queryConfig.parameterMode = 'NAMED';
    }

    const [job] = await this.bigQuery.createQueryJob(queryConfig);
    this.setLocationFromJob(job);
    return {
      totalBytesProcessed: Number(job.metadata.statistics.totalBytesProcessed),
      schema: job.metadata.statistics.query.schema ?? undefined,
      location: this.location,
      referencedTables: this.parseReferencedTables(job.metadata.statistics.query.referencedTables),
    };
  }

  private parseReferencedTables(raw: unknown): BigQueryTableReference[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const tables: BigQueryTableReference[] = [];
    for (const entry of raw) {
      const { projectId, datasetId, tableId } = (entry ?? {}) as Partial<BigQueryTableReference>;
      if (projectId && datasetId && tableId) {
        tables.push({ projectId, datasetId, tableId });
      }
    }
    return tables;
  }

  /**
   * Reads a table's storage-level modification time and its kind, in one free metadata call.
   *
   * `lastModifiedTime` is when the table's DATA last changed at the warehouse — not evidence
   * that the rows themselves cover a recent period, and not populated meaningfully for
   * EXTERNAL tables (their bytes live outside BigQuery). Returns `null` for the time when the
   * field is absent, so callers can report "unknown" instead of guessing.
   */
  public async getTableLastModified(
    reference: BigQueryTableReference
  ): Promise<{ type: string | null; lastModifiedTime: Date | null }> {
    const table = this.createTableReference(
      reference.projectId,
      reference.datasetId,
      reference.tableId
    );
    const [metadata] = await table.getMetadata();
    return {
      type: metadata?.type ?? null,
      lastModifiedTime: toDateOrNull(metadata?.lastModifiedTime),
    };
  }

  /**
   * Newest modification time across a sharded table set (`prefix_YYYYMMDD` and friends), read
   * from the dataset's `__TABLES__` meta-table in one query instead of one metadata call per
   * shard. The scan covers dataset metadata only, so it stays inside BigQuery's minimum
   * billing increment however many shards the set holds.
   *
   * Only genuine shards count. Matching the prefix alone would let neighbours that merely share
   * it — `events_backup`, `events_staging` — set the maximum and overstate how recent the shard
   * set is, which is exactly the misleading answer this metadata exists to avoid. The suffix
   * test therefore mirrors {@link GBQ_SHARDED_TABLE_SUFFIX_RE}: the remainder after the prefix
   * must be nothing but a shard-length digit run. It is applied to `SUBSTR` of the remainder so
   * the prefix stays a bound parameter and never has to be escaped into a regex.
   *
   * Uses `bigQuery.query()` deliberately: the result is a single row, so the buffering that
   * makes `query()` unsafe for report reads is irrelevant here.
   */
  public async getMaxShardLastModified(
    projectId: string,
    datasetId: string,
    tablePrefix: string
  ): Promise<Date | null> {
    if (!isValidBigQueryProjectId(projectId) || !isValidBigQueryDatasetId(datasetId)) {
      throw new Error(`Unsafe BigQuery identifier in ${projectId}.${datasetId}`);
    }

    // `_` and `%` are LIKE wildcards and shard prefixes routinely end in `_`; escape them so
    // `events_` cannot also match `eventsXlog_20240101`.
    const likePattern = `${tablePrefix.replace(/([\\%_])/g, '\\$1')}%`;
    const shardSuffixPattern = `^[0-9]{${GBQ_SHARD_SUFFIX_MIN_DIGITS},${GBQ_SHARD_SUFFIX_MAX_DIGITS}}$`;
    const [rows] = await this.bigQuery.query({
      query: `SELECT MAX(last_modified_time) AS last_modified_time
              FROM \`${projectId}.${datasetId}.__TABLES__\`
              WHERE table_id LIKE @tablePrefix
                AND REGEXP_CONTAINS(SUBSTR(table_id, @shardSuffixStart), @shardSuffixPattern)`,
      params: {
        tablePrefix: likePattern,
        // SUBSTR is 1-indexed, so the character after the prefix is at prefixLength + 1.
        shardSuffixStart: tablePrefix.length + 1,
        shardSuffixPattern,
      },
      parameterMode: 'NAMED',
      ...this.getLocationOption(),
    });

    return toDateOrNull(rows?.[0]?.last_modified_time);
  }

  /**
   * Gets job information by job ID
   */
  public async getJob(jobId: string): Promise<Job> {
    const job = this.bigQuery.job(jobId, this.getLocationOption());
    const [jobResult] = await job.get();
    this.setLocationFromJob(jobResult);
    return jobResult;
  }

  /**
   * Creates a table reference
   *
   * @param projectId - Google Cloud project ID
   * @param datasetId - BigQuery dataset ID
   * @param tableId - BigQuery table ID
   * @returns Table reference
   */
  public createTableReference(projectId: string, datasetId: string, tableId: string): Table {
    const dataset = this.bigQuery.dataset(datasetId, {
      projectId: projectId,
      ...this.getLocationOption(),
    });
    return dataset.table(tableId);
  }

  /**
   * Checks BigQuery access by running a trivial query (SELECT 1)
   */
  public async checkAccess(): Promise<void> {
    try {
      const [, , res] = await this.bigQuery.query('SELECT 1', this.getLocationOption());
      this.setLocationFromJobReference(res?.jobReference?.location);
    } catch (e) {
      throw new Error(`BigQuery access error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private getLocationOption(): { location?: string } {
    return this.location ? { location: this.location } : {};
  }

  private setLocationFromJobReference(location?: string | null): void {
    if (!this.location && location) {
      this.location = location;
    }
  }

  private setLocationFromJob(job: Job): void {
    this.setLocationFromJobReference(
      job.metadata?.jobReference?.location ?? job.metadata?.location
    );
  }
}
