import { Logger } from '@nestjs/common';
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  GetTableMetadataCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { AthenaConfig } from '../schemas/athena-config.schema';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { ResultSetMetadata } from '@aws-sdk/client-athena/dist-types/models/models_0';
import { GetQueryResultsCommandOutput } from '@aws-sdk/client-athena/dist-types/commands/GetQueryResultsCommand';
import { SqlParameter } from '../../utils/sql-clause-renderer';
import {
  inlineAthenaPositionalParams,
  toAthenaExecutionParameters,
} from './athena-execution-parameters.utils';

/**
 * Tuning for the execute-and-poll cycle of a single statement. Defaults preserve the historic
 * behaviour (1s polling, no cancellation) for the report/read paths; metadata lookups pass a
 * shorter interval so a handful of tiny catalog queries does not cost seconds of idle waiting.
 */
export interface AthenaQueryOptions {
  pollIntervalMs?: number;
  /** Stops the polling wait early; the query itself keeps running server-side. */
  signal?: AbortSignal;
}

/**
 * Adapter for Athena API operations
 */
export class AthenaApiAdapter {
  public static readonly ATHENA_QUERY_ERROR_PREFIX = 'Query execution failed:';

  private static readonly DEFAULT_POLL_INTERVAL_MS = 1000;

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
   * @param outputBucket - S3 bucket for query results
   * @param outputPrefix - S3 prefix for query results
   * @returns Query execution ID
   */
  public async executeQuery(
    query: string,
    outputBucket: string,
    outputPrefix: string,
    params?: SqlParameter[]
  ): Promise<{ queryExecutionId: string }> {
    const startQueryCommand = new StartQueryExecutionCommand({
      QueryString: query,
      ResultConfiguration: {
        OutputLocation: `s3://${outputBucket}/${outputPrefix}`,
      },
      ExecutionParameters: toAthenaExecutionParameters(params),
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
  public async waitForQueryToComplete(
    queryExecutionId: string,
    options?: AthenaQueryOptions
  ): Promise<void> {
    if (!queryExecutionId) {
      throw new Error('No query execution ID');
    }

    // Clamped so a zero/negative interval cannot turn this into a busy-loop.
    const intervalMs = Math.max(
      1,
      options?.pollIntervalMs ?? AthenaApiAdapter.DEFAULT_POLL_INTERVAL_MS
    );

    const getQueryExecutionCommand = new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId,
    });

    let status: QueryExecutionState | undefined;

    do {
      // Wait a bit before checking again
      await this.sleep(intervalMs, options?.signal);
      if (options?.signal?.aborted) {
        throw new Error(`Aborted while waiting for query execution ${queryExecutionId}`);
      }

      const response = await this.athenaClient.send(getQueryExecutionCommand);
      status = response.QueryExecution?.Status?.State;

      this.logger.debug(`Query status: ${status}`);

      if (status === QueryExecutionState.FAILED) {
        const errorMessage = response.QueryExecution?.Status?.StateChangeReason || 'Unknown error';
        throw new Error(`${AthenaApiAdapter.ATHENA_QUERY_ERROR_PREFIX} ${errorMessage}`);
      }

      if (status === QueryExecutionState.CANCELLED) {
        throw new Error('Query execution was cancelled');
      }
    } while (status !== QueryExecutionState.SUCCEEDED);
  }

  /** Resolves early (without throwing) when the signal aborts mid-wait. */
  private async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
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
      MaxResults: Math.min(maxResults, 1000),
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
   *
   * @param query - SQL query to validate
   * @param outputBucket - S3 bucket for query results
   */
  public async executeDryRunQuery(query: string, outputBucket: string): Promise<void> {
    const explainQuery = `EXPLAIN ${query}`;
    const { queryExecutionId } = await this.executeQuery(
      explainQuery,
      outputBucket,
      this.getOutputPrefix('athena-dry-run')
    );

    await this.waitForQueryToComplete(queryExecutionId);
  }

  /**
   * Returns the raw text of `EXPLAIN (TYPE IO, FORMAT JSON) <query>` — Athena's structured
   * answer to "which tables does this query read", with views already expanded by the planner.
   * EXPLAIN scans no data, so the call is free on the Athena side.
   *
   * Positional params are inlined as literals first: Athena binds ExecutionParameters as
   * literals anyway (see {@link inlineAthenaPositionalParams}), so the inlined statement is
   * byte-for-byte what execution would plan, without betting on parameterized EXPLAIN support.
   */
  public async getQueryIoPlan(
    query: string,
    outputBucket: string,
    params?: SqlParameter[],
    options?: AthenaQueryOptions
  ): Promise<string> {
    const explainQuery = `EXPLAIN (TYPE IO, FORMAT JSON) ${inlineAthenaPositionalParams(query, params)}`;
    const rows = await this.executeQueryAndGetRows(explainQuery, outputBucket, options);
    return rows.map(row => row[0] ?? '').join('\n');
  }

  /**
   * Runs a query and returns its result rows as arrays of cell values, with the header row
   * (Athena repeats the column names as the first row of SELECT results) already dropped.
   * Intended for small metadata queries, not for report-sized reads.
   */
  public async executeQueryAndGetRows(
    query: string,
    outputBucket: string,
    options?: AthenaQueryOptions
  ): Promise<Array<Array<string | null>>> {
    const { queryExecutionId } = await this.executeQuery(
      query,
      outputBucket,
      this.getOutputPrefix('athena-data-last-updated')
    );
    await this.waitForQueryToComplete(queryExecutionId, options);

    const rows: Array<Array<string | null>> = [];
    let nextToken: string | undefined;
    let firstPage = true;

    do {
      const results = await this.getQueryResults(queryExecutionId, nextToken);
      const pageRows = (results.ResultSet?.Rows ?? []).map(
        row => (row.Data ?? []).map(cell => cell.VarCharValue ?? null) as Array<string | null>
      );
      // Athena returns the column names as the first row of the first page for SELECT-shaped
      // results; EXPLAIN output has no such header. Detect it by position, drop it once.
      if (
        firstPage &&
        pageRows.length > 0 &&
        !query.trimStart().toUpperCase().startsWith('EXPLAIN')
      ) {
        pageRows.shift();
      }
      firstPage = false;
      rows.push(...pageRows);
      nextToken = results.NextToken;
    } while (nextToken);

    return rows;
  }

  /**
   * Reads one table's catalog metadata (type, creation time, parameters) through Athena's own
   * catalog API — the same information Glue holds, without taking a dependency on the Glue SDK.
   * Returns null when the table is not found; IAM errors propagate to the caller.
   */
  public async getTableMetadata(
    catalogName: string,
    database: string,
    table: string
  ): Promise<{
    tableType: string | null;
    createTime: Date | null;
    parameters: Record<string, string>;
  } | null> {
    try {
      const response = await this.athenaClient.send(
        new GetTableMetadataCommand({
          CatalogName: catalogName,
          DatabaseName: database,
          TableName: table,
        })
      );
      const metadata = response.TableMetadata;
      if (!metadata) {
        return null;
      }
      return {
        tableType: metadata.TableType ?? null,
        createTime: metadata.CreateTime ?? null,
        parameters: (metadata.Parameters ?? {}) as Record<string, string>,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'MetadataException') {
        // "Table not found" arrives as a MetadataException; that is an answer, not a failure.
        return null;
      }
      throw error;
    }
  }

  /**
   * Checks Athena access by running a query (SELECT 1).
   *
   * @param outputBucket - S3 bucket for query results
   */
  public async checkAccess(outputBucket: string): Promise<void> {
    const outputPrefix = this.getOutputPrefix('athena-check-access');
    const { queryExecutionId } = await this.executeQuery('SELECT 1', outputBucket, outputPrefix);
    await this.waitForQueryToComplete(queryExecutionId);
  }

  /**
   * Generates a unique S3 output prefix for Athena query results based on the operation name and current timestamp.
   *
   * @param operation - Name of the operation (e.g., 'athena-check-access')
   * @returns A unique S3 prefix string
   */
  private getOutputPrefix(operation: string): string {
    return `${operation}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
