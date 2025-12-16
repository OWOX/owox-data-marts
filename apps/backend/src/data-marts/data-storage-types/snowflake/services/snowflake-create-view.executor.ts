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
import {
  escapeSnowflakeIdentifier,
  escapeSnowflakeSchema,
} from '../utils/snowflake-identifier.utils';
import { SnowflakeApiAdapter } from '../adapters/snowflake-api.adapter';

@Injectable()
export class SnowflakeCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.SNOWFLAKE;

  private static readonly DEFAULT_DATABASE = 'OWOX_INTERNAL';
  private static readonly DEFAULT_SCHEMA = 'PUBLIC';

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
      const fullyQualifiedName = await this.normalizeAndEnsureObjects(adapter, viewName);
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
  private async normalizeAndEnsureObjects(
    adapter: SnowflakeApiAdapter,
    viewName: string
  ): Promise<string> {
    const parts = viewName.split('.').filter(Boolean);

    let database: string;
    let schema: string;
    let view: string;

    if (parts.length === 3) {
      // DB.SCHEMA.VIEW
      [database, schema, view] = parts;
    } else if (parts.length === 2) {
      // SCHEMA.VIEW → DB = DEFAULT_DATABASE
      database = SnowflakeCreateViewExecutor.DEFAULT_DATABASE;
      [schema, view] = parts;
    } else if (parts.length === 1) {
      // VIEW → DB = DEFAULT_DATABASE, SCHEMA = DEFAULT_SCHEMA
      database = SnowflakeCreateViewExecutor.DEFAULT_DATABASE;
      schema = SnowflakeCreateViewExecutor.DEFAULT_SCHEMA;
      [view] = parts;
    } else {
      throw new Error(
        `Invalid Snowflake view name. Expected "database.schema.view", "schema.view" or "view". Got: ${viewName}`
      );
    }

    await adapter.executeQuery(`CREATE DATABASE IF NOT EXISTS ${database}`);
    const schemaIdentifier = escapeSnowflakeSchema(database, schema);
    await adapter.executeQuery(`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);

    return escapeSnowflakeIdentifier(`${database}.${schema}.${view}`);
  }
}
