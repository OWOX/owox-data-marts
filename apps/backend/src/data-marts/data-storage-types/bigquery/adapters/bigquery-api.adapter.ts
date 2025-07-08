import { BigQuery, Job, Table } from '@google-cloud/bigquery';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';

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
    this.bigQuery = new BigQuery({
      projectId: config.projectId,
      location: config.location,
      credentials: credentials,
      scopes: [
        'https://www.googleapis.com/auth/bigquery',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
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
  public async executeDryRunQuery(query: string): Promise<{ totalBytesProcessed: number }> {
    const [job] = await this.bigQuery.createQueryJob({
      query,
      dryRun: true,
    });
    return { totalBytesProcessed: Number(job.metadata.statistics.totalBytesProcessed) };
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
