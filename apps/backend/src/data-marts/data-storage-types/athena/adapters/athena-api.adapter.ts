import { Logger } from '@nestjs/common';
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { AthenaConfig } from '../schemas/athena-config.schema';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { ResultSetMetadata } from '@aws-sdk/client-athena/dist-types/models/models_0';
import { GetQueryResultsCommandOutput } from '@aws-sdk/client-athena/dist-types/commands/GetQueryResultsCommand';

/**
 * Adapter for Athena API operations
 */
export class AthenaApiAdapter {
  private readonly logger = new Logger(AthenaApiAdapter.name);

  private readonly athenaClient: AthenaClient;

  /**
   * @param credentials - Athena credentials
   * @param config - Athena configuration
   * @throws Error if invalid credentials or config are provided
   * @returns Configuration values needed by the reader
   */
  constructor(credentials: AthenaCredentials, config: AthenaConfig) {
    // Create Athena client
    this.athenaClient = new AthenaClient({
      region: config.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });
  }

  /**
   * Executes a query in Athena
   *
   * @param query - SQL query to execute
   * @param databaseName - Database name to use for the query
   * @param outputBucket - S3 bucket for query results
   * @param outputPrefix - S3 prefix for query results
   * @returns Query execution ID
   */
  public async executeQuery(
    query: string,
    databaseName: string,
    outputBucket: string,
    outputPrefix: string
  ): Promise<{ queryExecutionId: string }> {
    const startQueryCommand = new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: {
        Database: databaseName,
      },
      ResultConfiguration: {
        OutputLocation: `s3://${outputBucket}/${outputPrefix}`,
      },
    });

    const response = await this.athenaClient.send(startQueryCommand);
    const queryExecutionId = response.QueryExecutionId;

    if (!queryExecutionId) {
      throw new Error('Failed to start query execution');
    }

    return { queryExecutionId };
  }

  /**
   * Waits for a query to complete
   *
   * @param queryExecutionId - Query execution ID to wait for
   */
  public async waitForQueryToComplete(queryExecutionId: string): Promise<void> {
    if (!queryExecutionId) {
      throw new Error('No query execution ID');
    }

    const getQueryExecutionCommand = new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId,
    });

    let status: QueryExecutionState | undefined;

    do {
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));

      const response = await this.athenaClient.send(getQueryExecutionCommand);
      status = response.QueryExecution?.Status?.State;

      this.logger.debug(`Query status: ${status}`);

      if (status === QueryExecutionState.FAILED) {
        const errorMessage = response.QueryExecution?.Status?.StateChangeReason || 'Unknown error';
        throw new Error(`Query execution failed: ${errorMessage}`);
      }

      if (status === QueryExecutionState.CANCELLED) {
        throw new Error('Query execution was cancelled');
      }
    } while (status !== QueryExecutionState.SUCCEEDED);
  }

  /**
   * Gets query results metadata
   *
   * @param queryExecutionId - Query execution ID to get metadata for
   */
  public async getQueryResultsMetadata(queryExecutionId: string): Promise<ResultSetMetadata> {
    if (!queryExecutionId) {
      throw new Error('No query execution ID');
    }

    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: 1, // Just get metadata
    });

    const results = await this.athenaClient.send(resultsCommand);

    if (
      !results.ResultSet ||
      !results.ResultSet.ResultSetMetadata ||
      !results.ResultSet.ResultSetMetadata.ColumnInfo
    ) {
      throw new Error('Failed to get query results metadata');
    }

    return results.ResultSet.ResultSetMetadata;
  }

  /**
   * Gets query results
   *
   * @param queryExecutionId - Query execution ID to get results for
   * @param batchId - Token for pagination
   * @param maxResults - Maximum number of results to return
   */
  public async getQueryResults(
    queryExecutionId: string,
    batchId?: string,
    maxResults: number = 1000
  ): Promise<GetQueryResultsCommandOutput> {
    if (!queryExecutionId) {
      throw new Error('No query execution ID');
    }

    const resultsCommand = new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: maxResults,
      NextToken: batchId,
    });

    const results = await this.athenaClient.send(resultsCommand);

    if (!results.ResultSet || !results.ResultSet.Rows) {
      throw new Error('Failed to get query results');
    }

    return results;
  }

  /**
   * Executes a dry run query in Athena using EXPLAIN to validate SQL syntax without running the query.
   * Returns status and errorMessage if any.
   */
  public async executeDryRunQuery(
    query: string,
    databaseName: string,
    outputBucket: string
  ): Promise<void> {
    const explainQuery = `EXPLAIN ${query}`;
    const { queryExecutionId } = await this.executeQuery(
      explainQuery,
      databaseName,
      outputBucket,
      this.getOutputPrefix('athena-dry-run')
    );

    await this.waitForQueryToComplete(queryExecutionId);
  }

  /**
   * Checks Athena access by running a query (SELECT 1)
   */
  public async checkAccess(databaseName: string, outputBucket: string): Promise<void> {
    const outputPrefix = this.getOutputPrefix('athena-check-access');
    const { queryExecutionId } = await this.executeQuery(
      'SELECT 1',
      databaseName,
      outputBucket,
      outputPrefix
    );
    await this.waitForQueryToComplete(queryExecutionId);
  }

  private getOutputPrefix(operation: string): string {
    return `${operation}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
