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
      const fullyQualifiedName = this.normalizeViewName(viewName);
      await adapter.createView(fullyQualifiedName, sql);

      return { fullyQualifiedName };
    } finally {
      await adapter.destroy();
    }
  }

  /**
   * Normalize view name to a fully qualified Databricks identifier.
   * Supports: catalog.schema.view, schema.view, or view
   * Note: catalog and schema are no longer part of storage config - they should be
   * provided as part of the view name (fully qualified name from connector definition)
   */
  private normalizeViewName(viewName: string): string {
    const parts = viewName.split('.').filter(Boolean);

    if (parts.length === 0) {
      throw new Error('Invalid Databricks view name: empty name provided');
    }

    // View name should already be fully qualified or partially qualified
    // We don't have default catalog/schema anymore at storage level
    return escapeFullyQualifiedIdentifier(parts);
  }
}
