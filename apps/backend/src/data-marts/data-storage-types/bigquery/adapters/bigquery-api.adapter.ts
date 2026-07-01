import { BigQuery, Job, Query, Table, TableSchema } from '@google-cloud/bigquery';
import { Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
import { BIGQUERY_AUTODETECT_LOCATION, BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BIGQUERY_OAUTH_TYPE, BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import type { SqlParameter } from '../../utils/sql-clause-renderer';

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
   */
  public async executeQuery(query: string, params?: SqlParameter[]): Promise<{ jobId: string }> {
    const queryConfig: Query =
      params && params.length > 0
        ? {
            query,
            params: Object.fromEntries(params.map(p => [p.name, p.value])),
            parameterMode: 'NAMED',
            ...this.getLocationOption(),
          }
        : {
            query,
            ...this.getLocationOption(),
          };

    const [job] = await this.bigQuery.createQueryJob(queryConfig);
    await this.waitForJobToComplete(job);
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
  private async waitForJobToComplete(job: Job): Promise<void> {
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
      await new Promise(resolve => setTimeout(resolve, BigQueryApiAdapter.JOB_POLL_INTERVAL_MS));
    }
  }

  /**
   * Executes a dry run query to estimate the number of bytes processed
   */
  public async executeDryRunQuery(
    query: string
  ): Promise<{ totalBytesProcessed: number; schema?: TableSchema; location?: string }> {
    const [job] = await this.bigQuery.createQueryJob({
      query,
      dryRun: true,
      ...this.getLocationOption(),
    });
    this.setLocationFromJob(job);
    return {
      totalBytesProcessed: Number(job.metadata.statistics.totalBytesProcessed),
      schema: job.metadata.statistics.query.schema ?? undefined,
      location: this.location,
    };
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
