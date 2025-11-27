import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { escapeSnowflakeSchema } from '../utils/snowflake-identifier.utils';

@Injectable()
export class SnowflakeCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(private readonly adapterFactory: SnowflakeApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isSnowflakeCredentials(credentials)) {
      throw new Error('Snowflake storage credentials expected');
    }
    if (!isSnowflakeConfig(config)) {
      throw new Error('Snowflake storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const fullyQualifiedName = this.normalizeViewName(viewName);

      // Extract database and schema from fully qualified name to ensure they exist
      const parts = fullyQualifiedName.split('.');
      if (parts.length === 3) {
        const [database, schema] = parts;
        const schemaIdentifier = escapeSnowflakeSchema(database, schema);
        const ddlSchema = `CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`;
        await adapter.executeQuery(ddlSchema);
      }

      await adapter.createView(fullyQualifiedName, sql);
      return { fullyQualifiedName };
    } finally {
      await adapter.destroy();
    }
  }

  /**
   * Normalize view name to a fully qualified Snowflake identifier.
   * The viewName must be in format: database.schema.view
   */
  private normalizeViewName(viewName: string): string {
    const parts = viewName.split('.');
    if (parts.length !== 3) {
      throw new Error(`View name must be fully qualified (database.schema.view). Got: ${viewName}`);
    }
    return viewName;
  }
}
