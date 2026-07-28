import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewOptions,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { escapeFullyQualifiedIdentifier } from '../utils/databricks-identifier.utils';

@Injectable()
export class DatabricksCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly adapterFactory: DatabricksApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string,
    options?: CreateViewOptions
  ): Promise<CreateViewResult> {
    if (!isDatabricksCredentials(credentials)) {
      throw new Error('Databricks storage credentials expected');
    }
    if (!isDatabricksConfig(config)) {
      throw new Error('Databricks storage config expected');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const referenceName = options?.requireFullyQualifiedName
        ? await this.resolveFullyQualifiedViewName(adapter, viewName)
        : viewName;
      const escapedViewName = this.normalizeViewName(referenceName);
      await adapter.createView(escapedViewName, sql);

      return {
        fullyQualifiedName: options?.requireFullyQualifiedName ? referenceName : escapedViewName,
      };
    } finally {
      await adapter.destroy();
    }
  }

  private async resolveFullyQualifiedViewName(
    adapter: ReturnType<DatabricksApiAdapterFactory['create']>,
    viewName: string
  ): Promise<string> {
    const parts = viewName.split('.').filter(Boolean);
    if (parts.length === 3) {
      return parts.join('.');
    }
    if (parts.length === 0 || parts.length > 3) {
      throw new Error(`Invalid Databricks view name: ${viewName}`);
    }

    const [namespace] = await adapter.executeQueryAndFetchAll(
      'SELECT current_catalog() AS catalog_name, current_schema() AS schema_name'
    );
    const catalog = namespace?.catalog_name;
    const schema = namespace?.schema_name;
    if (typeof catalog !== 'string' || typeof schema !== 'string' || !catalog || !schema) {
      throw new Error('Unable to resolve the current Databricks catalog and schema');
    }

    return parts.length === 2
      ? `${catalog}.${parts[0]}.${parts[1]}`
      : `${catalog}.${schema}.${parts[0]}`;
  }

  /**
   * Normalize view name to a fully qualified Databricks identifier.
   * Supports: catalog.schema.view, schema.view, or view
   */
  private normalizeViewName(viewName: string): string {
    const parts = viewName.split('.').filter(Boolean);

    if (parts.length === 0) {
      throw new Error('Invalid Databricks view name: empty name provided');
    }

    return escapeFullyQualifiedIdentifier(parts);
  }
}
