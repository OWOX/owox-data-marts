import {
  RedshiftDataClient,
  RedshiftDataClientConfig,
  ExecuteStatementCommand,
  ExecuteStatementCommandInput,
  DescribeStatementCommand,
  GetStatementResultCommand,
  GetStatementResultCommandOutput,
  ColumnMetadata,
  Field,
} from '@aws-sdk/client-redshift-data';
import { Logger } from '@nestjs/common';
import { RedshiftConfig } from '../schemas/redshift-config.schema';
import { RedshiftCredentials } from '../schemas/redshift-credentials.schema';
import { RedshiftConnectionType } from '../enums/redshift-connection-type.enum';
import { redshiftTimestampToIsoUtc } from '../utils/redshift-timestamp.utils';

/**
 * Tuning for the execute-and-poll cycle of a single statement. Defaults preserve the historic
 * behaviour (1s polling, no cancellation) for the report/read paths; metadata lookups pass a
 * shorter interval so a handful of tiny catalog queries does not cost seconds of idle waiting.
 */
export interface RedshiftQueryOptions {
  pollIntervalMs?: number;
  /** Stops the polling wait early; the statement itself keeps running server-side. */
  signal?: AbortSignal;
}

export class RedshiftApiAdapter {
  /** Overall per-statement deadline; unchanged from the historic 300 × 1s polling loop. */
  private static readonly QUERY_TIMEOUT_MS = 300_000;
  private static readonly DEFAULT_POLL_INTERVAL_MS = 1000;
  /**
   * Identifiers interpolated into SHOW TABLES, which takes no bind parameters and (unlike
   * regular SQL) has no documented quoting syntax — so only plain identifiers are accepted and
   * anything else is refused rather than escaped.
   */
  private static readonly SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

  private readonly logger = new Logger(RedshiftApiAdapter.name);
  private readonly redshiftDataClient: RedshiftDataClient;
  private readonly config: RedshiftConfig;

  constructor(credentials: RedshiftCredentials, config: RedshiftConfig) {
    this.config = config;

    const clientConfig: RedshiftDataClientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    };

    this.redshiftDataClient = new RedshiftDataClient(clientConfig);
  }

  /**
   * Executes a query and returns statement ID
   */
  public async executeQuery(query: string): Promise<{ statementId: string }> {
    const params: ExecuteStatementCommandInput = {
      Sql: query,
      Database: this.config.database,
    };

    if (this.config.connectionType === RedshiftConnectionType.SERVERLESS) {
      params.WorkgroupName = this.config.workgroupName;
    } else {
      params.ClusterIdentifier = this.config.clusterIdentifier;
    }

    this.logger.debug(`Executing query (${query.length} chars)`);

    const command = new ExecuteStatementCommand(params);
    const response = await this.redshiftDataClient.send(command);

    if (!response.Id) {
      throw new Error('Failed to execute query: No statement ID returned');
    }

    this.logger.debug(`Query started with statement ID: ${response.Id}`);

    return { statementId: response.Id };
  }

  /**
   * Polls until query completes (FINISHED, FAILED, or ABORTED)
   */
  public async waitForQueryToComplete(
    statementId: string,
    options?: RedshiftQueryOptions
  ): Promise<void> {
    // Clamped so a zero/negative interval cannot turn this into a busy-loop with an infinite
    // attempt budget.
    const intervalMs = Math.max(
      1,
      options?.pollIntervalMs ?? RedshiftApiAdapter.DEFAULT_POLL_INTERVAL_MS
    );
    const maxAttempts = Math.ceil(RedshiftApiAdapter.QUERY_TIMEOUT_MS / intervalMs);
    let attempts = 0;

    while (attempts < maxAttempts) {
      await this.sleep(intervalMs, options?.signal);
      if (options?.signal?.aborted) {
        throw new Error(`Aborted while waiting for statement ${statementId}`);
      }

      const describeCommand = new DescribeStatementCommand({ Id: statementId });
      const response = await this.redshiftDataClient.send(describeCommand);

      const status = response.Status;

      this.logger.debug(`Query status for ${statementId}: ${status} (attempt ${attempts + 1})`);

      if (status === 'FINISHED') {
        this.logger.debug(`Query ${statementId} completed successfully`);
        return;
      } else if (status === 'FAILED' || status === 'ABORTED') {
        const errorMessage = response.Error || response.QueryString || 'Unknown error';
        this.logger.error(`Query ${statementId} ${status}: ${errorMessage}`);
        throw new Error(`Query ${status}: ${errorMessage}`);
      }

      attempts++;
    }

    throw new Error(
      `Query execution timeout after ${RedshiftApiAdapter.QUERY_TIMEOUT_MS / 1000} seconds for statement ${statementId}`
    );
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
   */
  public async getQueryResultsMetadata(statementId: string): Promise<ColumnMetadata[]> {
    const command = new GetStatementResultCommand({
      Id: statementId,
    });
    const response = await this.redshiftDataClient.send(command);

    if (!response.ColumnMetadata) {
      throw new Error('No result columns metadata available');
    }

    return response.ColumnMetadata;
  }

  /**
   * Gets paginated query results
   */
  public async getQueryResults(
    statementId: string,
    nextToken?: string
  ): Promise<GetStatementResultCommandOutput> {
    const command = new GetStatementResultCommand({
      Id: statementId,
      NextToken: nextToken,
    });

    this.logger.debug(
      `Fetching results for ${statementId}:${nextToken ? ` (token: ${nextToken})` : ''}`
    );

    return await this.redshiftDataClient.send(command);
  }

  /**
   * Execute a SELECT query and return rows as plain JS objects
   */
  public async executeQueryAndGetRows(
    query: string,
    options?: RedshiftQueryOptions
  ): Promise<Array<Record<string, string | null>>> {
    const { statementId } = await this.executeQuery(query);
    await this.waitForQueryToComplete(statementId, options);

    const rows: Array<Record<string, string | null>> = [];
    let columns: string[] | undefined;
    let nextToken: string | undefined;

    do {
      const result = await this.getQueryResults(statementId, nextToken);

      if (!columns && result.ColumnMetadata) {
        columns = result.ColumnMetadata.map(col => col.label || col.name || '');
      }

      if (result.Records && columns) {
        result.Records.forEach(record => {
          rows.push(this.mapRecordToRow(record, columns!));
        });
      }

      nextToken = result.NextToken;
    } while (nextToken);

    return rows;
  }

  private mapRecordToRow(
    record: Field[] | undefined,
    columns: string[]
  ): Record<string, string | null> {
    const row: Record<string, string | null> = {};

    if (!record) {
      return row;
    }

    columns.forEach((colName, idx) => {
      row[colName] = this.extractFieldValue(record[idx]);
    });

    return row;
  }

  private extractFieldValue(field?: Field): string | null {
    if (!field) return null;
    if (field.isNull) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.longValue !== undefined) return field.longValue.toString();
    if (field.doubleValue !== undefined) return field.doubleValue.toString();
    if (field.booleanValue !== undefined) return field.booleanValue ? 'true' : 'false';
    if (field.blobValue !== undefined) return Buffer.from(field.blobValue).toString('utf-8');
    return null;
  }

  /**
   * Fetch column descriptions from Redshift catalog
   */
  public async getColumnDescriptions(
    schema: string,
    table: string
  ): Promise<Map<string, string | null>> {
    const query = `
      SELECT
        a.attname AS column_name,
        pg_catalog.col_description(a.attrelid, a.attnum) AS comment
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${this.escapeLiteral(schema)}'
        AND c.relname = '${this.escapeLiteral(table)}'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum
    `;

    const rows = await this.executeQueryAndGetRows(query);
    const descriptions = new Map<string, string | null>();

    rows.forEach(row => {
      const columnName = (row.column_name || row.COLUMN_NAME) as string | undefined;
      const comment = (row.comment || row.COMMENT) as string | null | undefined;

      if (columnName) {
        descriptions.set(columnName, comment ?? null);
      }
    });

    return descriptions;
  }

  private escapeLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Dry-run using EXPLAIN
   * Note: Redshift doesn't have a true "dry run" mode like Snowflake's describeOnly
   */
  public async executeDryRunQuery(query: string): Promise<void> {
    const explainQuery = `EXPLAIN ${query}`;
    const { statementId } = await this.executeQuery(explainQuery);
    await this.waitForQueryToComplete(statementId);

    this.logger.debug(`Dry-run validation successful for query ${query}`);
  }

  /**
   * Returns the raw plan lines of `EXPLAIN <query>` — one string per plan node. The plan is the
   * cheapest complete answer to "which tables does this query read": the planner has already
   * expanded views (late-binding ones included) down to base-table scans.
   */
  public async getQueryPlan(query: string, options?: RedshiftQueryOptions): Promise<string[]> {
    const rows = await this.executeQueryAndGetRows(`EXPLAIN ${query}`, options);
    return rows
      .map(row => Object.values(row)[0] ?? '')
      .filter((line): line is string => line !== '');
  }

  /**
   * Maps bare table names (as EXPLAIN prints them, schema-less) to the schemas that actually
   * contain a so-named table in the given database. A name returning several rows is ambiguous
   * and the caller must treat it as unresolvable rather than guess.
   */
  public async findTablesByName(
    database: string,
    tableNames: string[],
    options?: RedshiftQueryOptions
  ): Promise<Array<{ schemaName: string; tableName: string }>> {
    if (tableNames.length === 0) {
      return [];
    }

    const nameList = tableNames.map(name => `'${this.escapeLiteral(name)}'`).join(', ');
    const query = `
      SELECT schema_name, table_name
      FROM svv_redshift_tables
      WHERE database_name = '${this.escapeLiteral(database)}'
        AND table_type = 'TABLE'
        AND table_name IN (${nameList})
    `;

    const rows = await this.executeQueryAndGetRows(query, options);
    return rows
      .map(row => ({ schemaName: row.schema_name, tableName: row.table_name }))
      .filter((row): row is { schemaName: string; tableName: string } =>
        Boolean(row.schemaName && row.tableName)
      );
  }

  /**
   * Reads per-table modification times for one schema via `SHOW TABLES FROM SCHEMA`.
   *
   * SHOW TABLES is currently the ONLY surface where Redshift reports `last_modified_time`
   * (when the table's DATA last changed, lagging real writes by up to ~5 minutes) — none of the
   * queryable SVV catalog views carry it. It is schema-scoped with no table filter worth using,
   * so callers cache the result per schema. On older Redshift releases the column does not
   * exist yet; those rows come back with a null `lastModifiedTime`.
   */
  public async getSchemaTablesInfo(
    database: string,
    schema: string,
    options?: RedshiftQueryOptions
  ): Promise<Array<{ tableName: string; lastModifiedTime: string | null }>> {
    for (const identifier of [database, schema]) {
      if (!RedshiftApiAdapter.SAFE_IDENTIFIER_RE.test(identifier)) {
        throw new Error(`Unsupported identifier for SHOW TABLES: ${identifier}`);
      }
    }

    const rows = await this.executeQueryAndGetRows(
      `SHOW TABLES FROM SCHEMA ${database}.${schema}`,
      options
    );
    return rows
      .filter((row): row is Record<string, string | null> & { table_name: string } =>
        Boolean(row.table_name)
      )
      .map(row => ({
        tableName: row.table_name,
        lastModifiedTime: redshiftTimestampToIsoUtc(row.last_modified_time),
      }));
  }

  /**
   * Checks access by executing a simple query
   */
  public async checkAccess(): Promise<void> {
    this.logger.debug('Checking Redshift access...');
    const { statementId } = await this.executeQuery('SELECT 1');
    await this.waitForQueryToComplete(statementId);
    this.logger.debug('Redshift access check successful');
  }
}
