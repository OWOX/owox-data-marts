import { Logger } from '@nestjs/common';
import { DBSQLClient } from '@databricks/sql';
import type IDBSQLSession from '@databricks/sql/dist/contracts/IDBSQLSession';
import { DatabricksConfig } from '../schemas/databricks-config.schema';
import { DatabricksCredentials } from '../schemas/databricks-credentials.schema';
import { DatabricksQueryMetadata } from '../interfaces/databricks-query-metadata';
import { DatabricksQueryExplainJsonResponse } from '../interfaces/databricks-query-explain-json-response';
import { escapeFullyQualifiedIdentifier } from '../utils/databricks-identifier.utils';

/**
 * Adapter for Databricks SQL API operations
 *
 * Connection Management:
 * - Each adapter instance creates a dedicated Databricks SQL connection
 * - Connection is lazy-loaded on first use
 * - Connection must be explicitly destroyed via destroy() method
 * - Uses Databricks SQL Driver for Node.js (@databricks/sql)
 */
export class DatabricksApiAdapter {
  public static readonly DATABRICKS_QUERY_ERROR_PREFIX = 'Query execution failed:';

  private readonly logger = new Logger(DatabricksApiAdapter.name);

  private readonly client: DBSQLClient;
  private session: IDBSQLSession | null = null;
  private isConnected = false;

  /**
   * @param credentials - Databricks credentials (Personal Access Token)
   * @param config - Databricks configuration (host, httpPath)
   * @param catalog - Optional catalog to use for the session
   * @param schema - Optional schema to use for the session
   * @throws Error if invalid credentials or config are provided
   */
  constructor(
    private readonly credentials: DatabricksCredentials,
    private readonly config: DatabricksConfig,
    private readonly catalog?: string,
    private readonly schema?: string
  ) {
    this.client = new DBSQLClient();
  }

  /**
   * Connects to Databricks SQL warehouse
   */
  private async connect(): Promise<void> {
    if (this.isConnected && this.session) {
      return;
    }

    try {
      // First, connect the client to the Databricks SQL warehouse
      await this.client.connect({
        host: this.config.host,
        path: this.config.httpPath,
        token: this.credentials.token,
      });

      // Then open a session with optional catalog and schema
      this.session = await this.client.openSession({
        ...(this.catalog && { initialCatalog: this.catalog }),
        ...(this.schema && { initialSchema: this.schema }),
      });
      this.isConnected = true;
      this.logger.debug('Connected to Databricks SQL warehouse');
    } catch (error) {
      throw new Error(
        `Failed to connect to Databricks: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Destroys the Databricks connection
   */
  public async destroy(): Promise<void> {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      await this.client.close();
      this.isConnected = false;
      this.logger.debug('Databricks connection destroyed');
    } catch (error) {
      this.logger.error(
        `Failed to destroy connection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensures connection is established
   */
  private async ensureConnection(): Promise<IDBSQLSession> {
    if (!this.isConnected || !this.session) {
      await this.connect();
    }
    if (!this.session) {
      throw new Error('Failed to establish Databricks session');
    }
    return this.session;
  }

  /**
   * Executes a SQL query
   */
  public async executeQuery(query: string): Promise<{
    queryId: string;
    rows?: Record<string, unknown>[];
    metadata?: DatabricksQueryMetadata;
  }> {
    const session = await this.ensureConnection();

    try {
      const operation = await session.executeStatement(query);

      const result = await operation.fetchAll();
      await operation.close();

      const queryId = operation.id || '';
      const rows = result as Record<string, unknown>[];

      this.logger.debug(`Query executed: ${query}`);
      this.logger.debug(`Query returned ${rows?.length || 0} rows`);

      const metadata: DatabricksQueryMetadata = {
        queryId,
        statementId: queryId,
      };

      return { queryId, rows, metadata };
    } catch (error) {
      throw new Error(
        `${DatabricksApiAdapter.DATABRICKS_QUERY_ERROR_PREFIX} ${
          error instanceof Error ? error.message : String(error)
        }, ${query}`
      );
    }
  }

  /**
   * Executes a query and returns all rows
   */
  public async executeQueryAndFetchAll(query: string): Promise<Record<string, unknown>[]> {
    const { rows } = await this.executeQuery(query);
    return rows || [];
  }

  /**
   * Executes a dry run query to validate SQL syntax
   * Uses EXPLAIN to validate without executing
   */
  public async executeDryRunQuery(query: string): Promise<DatabricksQueryExplainJsonResponse> {
    try {
      const explainQuery = `EXPLAIN EXTENDED ${query}`;
      const { rows } = await this.executeQuery(explainQuery);

      if (!rows || rows.length === 0) {
        return { plan: '', isValid: true };
      }

      const plan = rows.map(row => row.plan).join('\n');
      this.logger.debug(`Explain result received (${plan.length} bytes)`);

      return {
        plan,
        isValid: true,
      };
    } catch (error) {
      return {
        plan: '',
        isValid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Checks Databricks access by running a trivial query (SELECT 1)
   */
  public async checkAccess(): Promise<void> {
    try {
      await this.executeQuery('SELECT 1');
    } catch (error) {
      throw new Error(
        `Databricks access error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gets table schema from Databricks
   * If tableName is not fully qualified, uses catalog and schema from constructor
   */
  public async getTableSchema(tableName: string): Promise<Record<string, unknown>[]> {
    const parts: string[] = [];

    if (this.catalog) {
      parts.push(this.catalog);
    }
    if (this.schema) {
      parts.push(this.schema);
    }
    parts.push(tableName);

    const fullyQualifiedName = escapeFullyQualifiedIdentifier(parts);
    const query = `DESCRIBE TABLE ${fullyQualifiedName}`;
    return this.executeQueryAndFetchAll(query);
  }

  /**
   * Gets table schema with catalog and schema explicitly specified
   */
  public async getTableSchemaWithPath(
    catalogName: string | undefined,
    schemaName: string | undefined,
    tableName: string
  ): Promise<Record<string, unknown>[]> {
    const parts: string[] = [];

    if (catalogName) {
      parts.push(catalogName);
    }
    if (schemaName) {
      parts.push(schemaName);
    }
    parts.push(tableName);

    const fullyQualifiedName = escapeFullyQualifiedIdentifier(parts);
    const query = `DESCRIBE TABLE ${fullyQualifiedName}`;
    return this.executeQueryAndFetchAll(query);
  }

  /**
   * Creates a view in Databricks
   * viewName can be a simple name or a fully qualified name (catalog.schema.view)
   */
  public async createView(viewName: string, query: string): Promise<void> {
    // viewName is already properly escaped by the caller if it's fully qualified
    const createViewQuery = `CREATE OR REPLACE VIEW ${viewName} AS ${query}`;
    await this.executeQuery(createViewQuery);
  }

  /**
   * Fetches results from a query with pagination
   */
  public async fetchResults(
    query: string,
    maxRows: number = 1000
  ): Promise<Record<string, unknown>[]> {
    const session = await this.ensureConnection();

    try {
      const operation = await session.executeStatement(query, {
        maxRows,
      });

      const result = await operation.fetchAll();
      await operation.close();

      return result as Record<string, unknown>[];
    } catch (error) {
      throw new Error(
        `Failed to fetch results: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
