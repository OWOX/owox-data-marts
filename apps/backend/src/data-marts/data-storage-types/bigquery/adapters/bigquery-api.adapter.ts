import { BigQuery, Job, Table, TableSchema } from '@google-cloud/bigquery';
import { Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { BIGQUERY_AUTODETECT_LOCATION, BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BIGQUERY_OAUTH_TYPE, BigQueryCredentials } from '../schemas/bigquery-credentials.schema';

/**
 * Adapter for BigQuery API operations.
 * Accepts either Service Account credentials or pre-resolved OAuth credentials.
 */
export class BigQueryApiAdapter {
  private readonly logger = new Logger(BigQueryApiAdapter.name);
  private readonly bigQuery: BigQuery;
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
   * Executes a SQL query
   */
  public async executeQuery(query: string): Promise<{ jobId: string }> {
    const [, , res] = await this.bigQuery.query(query, {
      maxResults: 0,
      ...this.getLocationOption(),
    });
    if (!res || !res.jobReference || !res.jobReference.jobId) {
      throw new Error('Unexpected error during getting sql result job id');
    }
    this.setLocationFromJobReference(res.jobReference.location);
    return { jobId: res.jobReference.jobId };
  }

  /**
   * Executes a dry run query to estimate the number of bytes processed
   */
  public async executeDryRunQuery(
    query: string
  ): Promise<{ totalBytesProcessed: number; schema?: TableSchema }> {
    const [job] = await this.bigQuery.createQueryJob({
      query,
      dryRun: true,
      ...this.getLocationOption(),
    });
    this.setLocationFromJob(job);
    return {
      totalBytesProcessed: Number(job.metadata.statistics.totalBytesProcessed),
      schema: job.metadata.statistics.query.schema ?? undefined,
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
