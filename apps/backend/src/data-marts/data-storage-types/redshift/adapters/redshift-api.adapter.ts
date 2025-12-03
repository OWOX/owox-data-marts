import {
  RedshiftDataClient,
  RedshiftDataClientConfig,
  ExecuteStatementCommand,
  ExecuteStatementCommandInput,
  DescribeStatementCommand,
  GetStatementResultCommand,
  GetStatementResultCommandOutput,
  ColumnMetadata,
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
        const error = response.Error || 'Unknown error';
        this.logger.error(`Query ${statementId} ${status}: ${error}`);
        throw new Error(`Query ${status}: ${error}`);
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
