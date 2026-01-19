import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { escapeFullyQualifiedIdentifier } from '../utils/databricks-identifier.utils';
import { DatabricksApiAdapter } from '../adapters/databricks-api.adapter';
import { DatabricksConfig } from '../schemas/databricks-config.schema';

@Injectable()
export class DatabricksCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly adapterFactory: DatabricksApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isDatabricksCredentials(credentials)) {
      throw new Error('Databricks storage credentials expected');
    }
    if (!isDatabricksConfig(config)) {
      throw new Error('Databricks storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const fullyQualifiedName = this.normalizeViewName(adapter, viewName, config);
      await adapter.createView(fullyQualifiedName, sql);

      return { fullyQualifiedName };
    } finally {
      await adapter.destroy();
    }
  }

  /**
   * Normalize view name to a fully qualified Databricks identifier.
   * Supports: catalog.schema.view, schema.view, or view
   */
  private normalizeViewName(
    adapter: DatabricksApiAdapter,
    viewName: string,
    config: DatabricksConfig
  ): string {
    const parts = viewName.split('.').filter(Boolean);

    let catalog: string | undefined;
    let schema: string | undefined;
    let view: string;

    if (parts.length === 3) {
      // catalog.schema.view
      [catalog, schema, view] = parts;
    } else if (parts.length === 2) {
      // schema.view → use catalog from config
      catalog = config.catalog;
      [schema, view] = parts;
    } else if (parts.length === 1) {
      // view → use catalog and schema from config
      catalog = config.catalog;
      schema = config.schema;
      [view] = parts;
    } else {
      throw new Error(
        `Invalid Databricks view name. Expected "catalog.schema.view", "schema.view" or "view". Got: ${viewName}`
      );
    }

    const qualifiedParts: string[] = [];
    if (catalog) qualifiedParts.push(catalog);
    if (schema) qualifiedParts.push(schema);
    qualifiedParts.push(view);

    return escapeFullyQualifiedIdentifier(qualifiedParts);
  }
}
