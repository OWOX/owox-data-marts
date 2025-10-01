import { BigQuery, Job, Table, TableSchema } from '@google-cloud/bigquery';
import { JWT } from 'google-auth-library';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';

/**
 * Adapter for BigQuery API operations
 */
export class BigQueryApiAdapter {
  private readonly bigQuery: BigQuery;

  /**
   * @param credentials - BigQuery credentials
   * @param config - BigQuery configuration
   * @throws Error if invalid credentials or config are provided
   */
  constructor(credentials: BigQueryCredentials, config: BigQueryConfig) {
    const authClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/bigquery',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

    this.bigQuery = new BigQuery({
      projectId: config.projectId,
      location: config.location,
      authClient,
    });
  }

  /**
   * Executes a SQL query
   */
  public async executeQuery(query: string): Promise<{ jobId: string }> {
    const [, , res] = await this.bigQuery.query(query, { maxResults: 0 });
    if (!res || !res.jobReference || !res.jobReference.jobId) {
      throw new Error('Unexpected error during getting sql result job id');
    }
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
    });
    return {
      totalBytesProcessed: Number(job.metadata.statistics.totalBytesProcessed),
      schema: job.metadata.statistics.query.schema ?? undefined,
    };
  }

  /**
   * Gets job information by job ID
   */
  public async getJob(jobId: string): Promise<Job> {
    const job = this.bigQuery.job(jobId);
    const [jobResult] = await job.get();
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
    const dataset = this.bigQuery.dataset(datasetId, { projectId: projectId });
    return dataset.table(tableId);
  }

  /**
   * Checks BigQuery access by running a trivial query (SELECT 1)
   */
  public async checkAccess(): Promise<void> {
    try {
      await this.bigQuery.query('SELECT 1');
    } catch (e) {
      throw new Error(`BigQuery access error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
