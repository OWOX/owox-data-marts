import { Logger } from '@nestjs/common';
import * as snowflake from 'snowflake-sdk';
import { SnowflakeConfig } from '../schemas/snowflake-config.schema';
import { SnowflakeCredentials } from '../schemas/snowflake-credentials.schema';
import { SnowflakeAuthMethod } from '../enums/snowflake-auth-method.enum';
import { SnowflakeQueryMetadata } from '../interfaces/snowflake-query-metadata';
import { SnowflakeQueryExplainJsonResponse } from '../interfaces/snowflake-query-explain-json-response';

/**
 * Adapter for Snowflake API operations
 */
export class SnowflakeApiAdapter {
  public static readonly SNOWFLAKE_QUERY_ERROR_PREFIX = 'Query execution failed:';

  private readonly logger = new Logger(SnowflakeApiAdapter.name);

  private readonly connection: snowflake.Connection;

  /**
   * @param credentials - Snowflake credentials
   * @param config - Snowflake configuration
   * @throws Error if invalid credentials or config are provided
   */
  constructor(credentials: SnowflakeCredentials, config: SnowflakeConfig) {
    snowflake.configure({
      logLevel: 'OFF'
    });
    const connectionOptions: snowflake.ConnectionOptions = {
      account: config.account,
      warehouse: config.warehouse,
    };

    if (credentials.authMethod === SnowflakeAuthMethod.PASSWORD) {
      connectionOptions.username = credentials.username;
      connectionOptions.password = credentials.password;
    } else if (credentials.authMethod === SnowflakeAuthMethod.KEY_PAIR) {
      connectionOptions.username = credentials.username;
      connectionOptions.authenticator = 'SNOWFLAKE_JWT';
      connectionOptions.privateKey = credentials.privateKey;
      if (credentials.privateKeyPassphrase) {
        connectionOptions.privateKeyPass = credentials.privateKeyPassphrase;
      }
    }

    this.connection = snowflake.createConnection(connectionOptions);
  }

  /**
   * Connects to Snowflake
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.connect((err) => {
        if (err) {
          reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Destroys the Snowflake connection
   */
  public async destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection.destroy((err) => {
        if (err) {
          reject(new Error(`Failed to destroy connection: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Executes a SQL query
   */
  public async executeQuery(query: string, dryRun: boolean = false): Promise<{ queryId: string; rows?: any[]; metadata?: SnowflakeQueryMetadata }> {
    if (!this.connection.isUp()) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: query,
        describeOnly: dryRun,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new Error(`${SnowflakeApiAdapter.SNOWFLAKE_QUERY_ERROR_PREFIX} ${err.message}`));
          } else {
            this.logger.log(`Query executed: ${query}`);
            this.logger.log(`Query rows: ${JSON.stringify(rows)}`);
            const columns = stmt.getColumns();
            const metadata: SnowflakeQueryMetadata = {
              columns: columns?.map(col => ({
                name: col.getName(),
                type: col.getType(),
                nullable: col.isNullable(),
                precision: col.getPrecision(),
                scale: col.getScale(),
              })) || [],
            };
            this.logger.log(`Query metadata: ${JSON.stringify(metadata)}`);
            const queryId = stmt.getQueryId();
            resolve({ queryId, rows, metadata });
          }
        },
      });
    });
  }

  /**
   * Executes a query and returns all rows
   */
  public async executeQueryAndFetchAll(query: string): Promise<any[]> {
    const { rows } = await this.executeQuery(query);
    return rows || [];
  }

  /**
   * Executes a dry run query to validate SQL syntax
   * Uses EXPLAIN to validate without executing
   */
  public async executeDryRunQuery(query: string): Promise<SnowflakeQueryExplainJsonResponse> {
    const explainQuery = `EXPLAIN USING JSON (${query})`;
    const { rows } = await this.executeQuery(explainQuery, false);
    
    if (!rows || rows.length === 0) {
      throw new Error('Failed to get explain result');
    }
    this.logger.log(`Explain rows: ${JSON.stringify(rows[0].content)}`);
    return JSON.parse(rows[0].content) as SnowflakeQueryExplainJsonResponse;
  }

  /**
   * Checks Snowflake access by running a trivial query (SELECT 1)
   */
  public async checkAccess(): Promise<void> {
    try {
      if (!this.connection.isUp()) {
        await this.connect();
      }
      await this.executeQuery('SELECT 1');
    } catch (e) {
      throw new Error(`Snowflake access error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Gets query status by query ID
   */
  public async getQueryStatus(queryId: string): Promise<'RUNNING' | 'SUCCEEDED' | 'FAILED'> {
    if (!this.connection.isUp()) {
      await this.connect();
    }

    const statusQuery = `SELECT * FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY_BY_SESSION()) WHERE QUERY_ID = '${queryId}'`;
    const { rows } = await this.executeQuery(statusQuery);

    if (!rows || rows.length === 0) {
      throw new Error(`Query ${queryId} not found`);
    }

    const status = rows[0].EXECUTION_STATUS;
    return status;
  }

  /**
   * Gets table schema
   */
  public async getTableSchema(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<any[]> {
    const query = `DESCRIBE TABLE ${databaseName}.${schemaName}.${tableName}`;
    return this.executeQueryAndFetchAll(query);
  }

  /**
   * Creates a view
   */
  public async createView(viewName: string, query: string): Promise<void> {
    const createViewQuery = `CREATE OR REPLACE VIEW ${viewName} AS ${query}`;
    await this.executeQuery(createViewQuery);
  }
}
