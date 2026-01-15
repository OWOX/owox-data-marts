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

export class RedshiftApiAdapter {
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

    this.logger.debug(`Executing query: ${query}`);

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
  public async waitForQueryToComplete(statementId: string): Promise<void> {
    const maxAttempts = 300; // 5 minutes with 1s intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

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
      `Query execution timeout after ${maxAttempts} seconds for statement ${statementId}`
    );
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
    query: string
  ): Promise<Array<Record<string, string | null>>> {
    const { statementId } = await this.executeQuery(query);
    await this.waitForQueryToComplete(statementId);

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
   * Checks access by executing a simple query
   */
  public async checkAccess(): Promise<void> {
    this.logger.debug('Checking Redshift access...');
    const { statementId } = await this.executeQuery('SELECT 1');
    await this.waitForQueryToComplete(statementId);
    this.logger.debug('Redshift access check successful');
  }
}
